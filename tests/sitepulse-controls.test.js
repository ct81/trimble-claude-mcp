import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/sitepulse/sitepulse.html', import.meta.url), 'utf8');

class Element {
    constructor(tag = 'div') { this.tag = tag; }
    children = [];
    listeners = {};
    classList = { add() {}, remove() {} };
    addEventListener(event, handler) { this.listeners[event] = handler; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name]; }
    focus() { this.focused = true; }
    querySelectorAll() { return []; }
}
class Group {
    children = [];
    visible = true;
    add(child) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = this;
        this.children.push(child);
    }
    remove(child) { this.children = this.children.filter(item => item !== child); child.parent = null; }
    traverse(fn) { fn(this); this.children.forEach(child => child.traverse ? child.traverse(fn) : fn(child)); }
    traverseVisible(fn) {
        if (!this.visible) return;
        fn(this);
        this.children.forEach(child => {
            if (child.traverseVisible) child.traverseVisible(fn);
            else if (child.visible) fn(child);
        });
    }
}

test('floor layers inherit spatial containment, keep unassigned meshes, and preserve mesh visibility', () => {
    const elements = Object.fromEntries(['model-transparency', 'model-transparency-value', 'model-layers', 'model-element-types',
        'model-floors-tab', 'model-types-tab', 'btn-show-all', 'btn-isolate']
        .map(id => [id, new Element()]));
    elements['model-floors-tab'].setAttribute('aria-controls', 'model-layers');
    elements['model-types-tab'].setAttribute('aria-controls', 'model-element-types');
    elements['btn-isolate'].classList = { remove() {} };
    const model = new Group();
    const material = { opacity: .7 };
    const meshes = [12, 13, 21, 99].map(id => ({ isMesh: true, visible: true, userData: { expressID: id }, material }));
    meshes.forEach(mesh => model.add(mesh));
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: () => new Element(), createTextNode: text => ({ text }) },
        THREE: { Group }, currentIfcModel: model,
        explorerTree: { children: [
            { id: 10, type: 'IfcBuildingStorey', name: 'Level 1', children: [
                { id: 11, type: 'IfcSpace', children: [
                    { id: 12, type: 'IfcBeam', children: [] }, { id: 13, type: 'IfcColumn', children: [] }
                ] }
            ] },
            { id: 20, type: 'IFCBUILDINGSTOREY', name: 'Level 2', children: [{ id: 21, type: 'IFCBEAM', children: [] }] }
        ] },
        sharedDefaultMaterial: material, selectedMaterial: { opacity: .9 }, colorByMaterials: [],
        selectedOriginalMaterials: new Map(), statusPlaybackMaterials: new Map(), statusPlaybackOriginals: new Map()
    });
    const start = page.indexOf('        let modelTransparency =');
    const end = page.indexOf('        const loadingOverlay', start);
    vm.runInContext(page.slice(start, end), context);
    vm.runInContext('buildFloorLayers()', context);
    assert.deepEqual(model.children.map(group => group.name), ['Level 1', 'Level 2', 'Unassigned / Other']);
    const checkbox = elements['model-layers'].children[0].children[0];
    checkbox.checked = false;
    checkbox.listeners.change();
    assert.equal(model.children[0].visible, false);
    assert.equal(vm.runInContext('getModelMeshes(true).length', context), 2);
    meshes[0].visible = false;
    checkbox.checked = true;
    checkbox.listeners.change();
    assert.equal(meshes[0].visible, false, 'Floor toggle must not undo playback or isolation visibility');
    assert.equal(vm.runInContext('getModelMeshes().length', context), 4);
    const typeRows = elements['model-element-types'].children;
    assert.deepEqual(typeRows.map(row => row.children[1].text), ['Beam (2)', 'Column (1)', 'Unknown (1)']);
    const beamCheckbox = typeRows[0].children[0];
    beamCheckbox.checked = false;
    beamCheckbox.listeners.change();
    assert.equal(vm.runInContext('getModelMeshes(true).length', context), 2);
    checkbox.checked = false;
    checkbox.listeners.change();
    assert.equal(vm.runInContext('getModelMeshes(true).length', context), 1);
    checkbox.checked = true;
    checkbox.listeners.change();
    assert.equal(vm.runInContext('getModelMeshes(true).length', context), 2, 'Showing a floor must not reveal hidden types');
    assert.equal(meshes[0].visible, false, 'Type filters must not overwrite isolation/playback visibility');
    elements['model-types-tab'].listeners.click();
    assert.equal(elements['model-layers'].hidden, true);
    assert.equal(elements['model-element-types'].hidden, false);
    assert.equal(elements['model-types-tab'].getAttribute('aria-selected'), 'true');
    elements['model-types-tab'].listeners.keydown({ key: 'ArrowLeft', preventDefault() {} });
    assert.equal(elements['model-layers'].hidden, false);
    assert.equal(elements['model-element-types'].hidden, true);
    assert.equal(elements['model-floors-tab'].focused, true);

    for (const value of ['0', '65', '100']) {
        elements['model-transparency'].listeners.input({ target: { value } });
        assert.equal(material.opacity, 1 - Number(value) / 100);
        assert.equal(elements['model-transparency-value'].textContent, `${value}%`);
    }
    const futureMaterial = { opacity: 1 };
    context.futureMaterial = futureMaterial;
    vm.runInContext('applyMaterialTransparency(futureMaterial)', context);
    assert.equal(futureMaterial.opacity, 0, 'New coloring materials inherit current transparency');

    checkbox.checked = false;
    checkbox.listeners.change();
    context.clearSelection = () => {};
    context.isIsolated = true;
    const showAllStart = page.indexOf("        document.getElementById('btn-show-all').addEventListener");
    const showAllEnd = page.indexOf("        document.getElementById('color-by-select').addEventListener", showAllStart);
    vm.runInContext(page.slice(showAllStart, showAllEnd), context);
    elements['btn-show-all'].listeners.click();
    assert.equal(checkbox.checked, true);
    assert.ok(model.children.every(group => group.visible));
    assert.ok(meshes.every(mesh => mesh.visible));
    assert.equal(beamCheckbox.checked, true);
    assert.equal(vm.runInContext('getModelMeshes(true).length', context), 4);
    assert.equal(context.isIsolated, false);
    vm.runInContext('buildFloorLayers()', context);
    assert.equal(model.children.length, 3, 'Rebuilding layers must replace old floor groups');
    assert.equal(vm.runInContext('getModelMeshes().length', context), 4);
});

test('Explorer group labels select all descendant model elements, including through filtered or collapsed branches', () => {
    const leaf = (id, name) => ({ id, name, type: 'IFCWALL', children: [] });
    const assembly = {
        id: 40, name: '8K1F1', type: 'IFCELEMENTASSEMBLY',
        children: [{ name: 'Wall (2)', children: [leaf(41, 'Wall A'), leaf(42, 'Wall B')] }]
    };
    const tree = { name: 'model.ifc', children: [{ name: 'Building (1)', children: [
        { id: 10, name: 'Undefined', type: 'IFCBUILDING', children: [{ name: 'BuildingStorey (1)', children: [
            { id: 20, name: 'Undefined', type: 'IFCBUILDINGSTOREY', children: [
                { name: 'ElementAssembly (2)', children: [assembly, {
                    id: 50, name: '8K1F2', type: 'IFCELEMENTASSEMBLY', children: [leaf(51, 'Wall C')]
                }] }
            ] }
        ] }] }
    ] }] };
    const explorerTreeElement = new Element(), search = { value: '' };
    const selected = [], properties = [];
    const meshes = [40, 41, 42, 51, 99].map(id => ({ userData: { expressID: id } }));
    const context = vm.createContext({
        explorerTree: tree, explorerTreeElement, explorerSearch: search, currentModelID: 0,
        document: { createElement: tag => new Element(tag) },
        getModelMeshes: () => meshes,
        clearSelection: () => { selected.length = 0; properties.length = 0; },
        addMeshToSelection: mesh => selected.push(mesh.userData.expressID),
        showElementProperties: (model, id) => properties.push([model, id])
    });
    const start = page.indexOf('        function renderExplorer()');
    const end = page.indexOf('        function refreshExplorer()', start);
    vm.runInContext(page.slice(start, end), context);
    vm.runInContext('renderExplorer()', context);
    const buttons = [];
    const expand = element => {
        if (element.tag === 'details') { element.open = true; element.listeners.toggle(); }
        if (element.tag === 'button') buttons.push(element);
        element.children.forEach(expand);
    };
    expand(explorerTreeElement);
    const click = button => button.listeners.click({ preventDefault() {}, stopPropagation() {} });
    for (const name of ['Building (1)', 'BuildingStorey (1)', 'ElementAssembly (2)']) {
        click(buttons.find(button => button.textContent === name));
        assert.deepEqual(selected, [40, 41, 42, 51], name);
        assert.deepEqual(properties, [], 'Synthetic group labels must not request properties for an undefined ID');
    }
    for (const button of buttons.filter(button => button.textContent === 'Undefined')) {
        click(button);
        assert.deepEqual(selected, [40, 41, 42, 51]);
        assert.equal(properties.length, 1);
    }
    click(buttons.find(button => button.textContent === '8K1F1'));
    assert.deepEqual(selected, [40, 41, 42]);
    assert.deepEqual(properties, [[0, 40]]);
    click(buttons.find(button => button.textContent === 'Wall A'));
    assert.deepEqual(selected, [41]);

    search.value = 'Wall A';
    vm.runInContext('renderExplorer()', context);
    buttons.length = 0;
    expand(explorerTreeElement);
    click(buttons.find(button => button.textContent === '8K1F1'));
    assert.deepEqual(selected, [40, 41, 42], 'Search must not limit the contents selected for a group');
});

test('SitePulse module scripts parse', () => {
    for (const [, attributes, source] of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc=|type=["']importmap/i.test(attributes)) continue;
        const withoutImports = source.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');
        assert.doesNotThrow(() => new vm.Script(withoutImports));
    }
});
