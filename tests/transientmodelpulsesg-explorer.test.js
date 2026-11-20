import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildExplorerTree } from '../pages/misc/transientmodelpulsesg-explorer.js';

const types = { project: 1, product: 2, aggregates: 3, nests: 4, contains: 5 };
const ref = value => ({ value });
const vector = values => ({ size: () => values.length, get: index => values[index] });

test('builds a model hierarchy from IFC relationships, including products without geometry', () => {
    const lines = new Map([
        [10, { Name: ref('Project') }], [11, { Name: ref('Building') }],
        [12, { Name: ref('Level 2') }], [13, { Name: ref('Wall A') }],
        [14, { Name: ref('Space without mesh') }], [15, { Name: ref('Uncontained beam') }],
        [20, { RelatingObject: ref(10), RelatedObjects: [ref(11)] }],
        [21, { RelatingObject: ref(11), RelatedObjects: [ref(12)] }],
        [22, { RelatingStructure: ref(12), RelatedElements: [ref(13), ref(14)] }]
    ]);
    const codes = { 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15 };
    const names = { 10: 'IfcProject', 11: 'IfcBuilding', 12: 'IfcBuildingStorey', 13: 'IfcWall', 14: 'IfcSpace', 15: 'IfcBeam' };
    const byType = { 1: [10], 2: [11, 12, 13, 14, 15], 3: [20, 21], 4: [], 5: [22] };
    const api = {
        GetLineIDsWithType: (_model, type) => vector(byType[type]),
        GetLine: (_model, id) => lines.get(id),
        GetLineType: (_model, id) => codes[id],
        GetNameFromTypeCode: code => names[code]
    };
    const tree = buildExplorerTree(api, 0, 'model.ifc', types);
    const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
    assert.equal(tree.name, 'model.ifc');
    assert.equal(find(tree, 10).children[0].name, 'Building (1)');
    assert.equal(find(tree, 11).children[0].name, 'BuildingStorey (1)');
    assert.equal(find(tree, 12).children.find(group => group.name === 'Wall (1)').children[0].id, 13);
    assert.equal(find(tree, 12).children.find(group => group.name === 'Space (1)').children[0].id, 14);
    assert.equal(find(tree, 15).name, 'Uncontained beam');
});

test('keeps cyclic or malformed relationships from losing or duplicating entities', () => {
    const lines = {
        1: { Name: ref('A') }, 2: { Name: ref('B') },
        3: { RelatingObject: ref(1), RelatedObjects: [ref(2), ref(1)] },
        4: { RelatingObject: ref(2), RelatedObjects: [ref(1)] }
    };
    const api = {
        GetLineIDsWithType: (_model, type) => vector(({ 1: [], 2: [1, 2], 3: [3, 4], 4: [], 5: [] })[type]),
        GetLine: (_model, id) => lines[id],
        GetLineType: () => 10,
        GetNameFromTypeCode: () => 'IfcWall'
    };
    const tree = buildExplorerTree(api, 0, 'cycle.ifc', types);
    const ids = [];
    const walk = node => { if (node.id !== undefined) ids.push(node.id); node.children.forEach(walk); };
    walk(tree);
    assert.deepEqual(ids.sort(), [1, 2]);
});

test('opens, searches, selects geometryless items and refreshes for another model', () => {
    class Element {
        constructor(tag = 'div') {
            this.tag = tag;
            this.children = [];
            this.style = {};
            this.listeners = {};
            this.classList = { add() {}, remove() {} };
            this.value = '';
        }
        addEventListener(type, handler) { this.listeners[type] = handler; }
        appendChild(child) { this.children.push(child); return child; }
        replaceChildren() { this.children = []; this.textContent = ''; }
        setAttribute(name, value) { this[name] = value; }
        querySelectorAll() { return []; }
        querySelector() { return { click: () => { this.style.display = 'none'; } }; }
        click() { this.listeners.click?.({ preventDefault() {}, stopPropagation() {} }); }
    }
    const panel = new Element(); panel.style.display = 'none';
    const button = new Element('button');
    const search = new Element('input');
    const tree = new Element();
    const elements = { 'explorer-panel': panel, 'btn-explorer': button, 'explorer-search': search, 'explorer-tree': tree };
    const selected = [];
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) },
        MutationObserver: class { observe() {} },
        currentModelID: 0,
        currentIfcModel: { children: [] },
        ifcAPI: {}, IFCPROJECT: 1, IFCPRODUCT: 2, IFCRELAGGREGATES: 3, IFCRELNESTS: 4, IFCRELCONTAINEDINSPATIALSTRUCTURE: 5,
        buildExplorerTree: (_api, id, filename) => ({
            name: filename, children: [{ name: 'Space (1)', children: [{ id: id + 10, type: 'IfcSpace', name: 'Office', children: [] }] }]
        }),
        reopenPanel: () => { panel.style.display = 'flex'; },
        clearSelection: () => selected.push('clear'),
        addMeshToSelection: () => selected.push('mesh'),
        showElementProperties: (model, id) => selected.push([model, id]),
        showToast: message => { throw new Error(message); }
    });
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const start = page.indexOf('        const explorerPanel =');
    const end = page.indexOf('        function _safeGetLine(', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(page.slice(start, end), context);
    button.click();
    assert.equal(panel.style.display, 'flex');
    search.value = 'office';
    search.listeners.input();
    const findButton = node => node.tag === 'button' ? node : node.children?.map(findButton).find(Boolean);
    findButton(tree).click();
    assert.deepEqual(selected, ['clear', [0, 10]]);
    vm.runInContext("currentModelID = 1; currentIfcFilename = 'new.ifc'; refreshExplorer();", context);
    assert.equal(tree.children[0].children[0].children[0].textContent, 'new.ifc');
    findButton(tree).click();
    assert.deepEqual(selected.at(-1), [1, 11]);
});
