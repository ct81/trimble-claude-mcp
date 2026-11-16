import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = page.indexOf(start);
    const to = page.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    return page.slice(from, to);
};

function createHarness() {
    const element = () => ({
        children: [], style: {}, dataset: {}, innerHTML: '',
        classList: { add() {}, contains() { return false; } },
        appendChild(child) { this.children.push(child); },
        append(...children) { this.children.push(...children); },
        addEventListener() {}
    });
    const tabContentContainer = element();
    const mesh = { userData: { expressID: 1 } };
    const context = vm.createContext({
        Date, Map, Set, Number, String, Promise,
        setTimeout: callback => callback(),
        importedDataMap: new Map(),
        importStatus: {},
        selectedMeshes: new Map(),
        selectedOriginalMaterials: new Map(),
        statusColoredMeshes: new Set(),
        guidToMeshMap: new Map([['guid-1', mesh]]),
        inspectorPanel: element(),
        tabNav: element(),
        tabContentContainer,
        searchInput: {},
        currentModelID: 0,
        showToast() {},
        safeExpressID: id => id,
        ifcAPI: {
            GetLine: () => ({ GlobalId: { value: 'guid-1' }, type: 'IFCWALL' }),
            properties: { getPropertySets: () => [] }
        },
        iterateCollection() {},
        document: { createElement: element, querySelectorAll: () => [] },
        THREE: { Color: class { constructor(value) { this.value = value; } clone() { return this; } multiplyScalar() { return this; } } },
        sharedDefaultMaterial: { clone: () => ({}) }
    });
    vm.runInContext(
        section('        function normalizeImportedDate(', '        // Central color map') +
        section('        const STATUS_COLOR_MAP', '        // Populate the Status Legend') +
        section('        function applyStatusColors()', "        document.getElementById('btn-load-sample')") +
        section('        async function showElementProperties(', '        async function runSGValidation('),
        context
    );
    return { context, mesh, tabContentContainer };
}

test('preserves matching records, sorts dates, and colors by newest status', async () => {
    const { context, mesh, tabContentContainer } = createHarness();
    context.processImportedData([
        { 'IFC Guide': 'guid-1', Marking: 'W-01', status: 'In Progress', 'updated on': new Date(2024, 4, 15) },
        { 'IFC Guide': 'guid-2', Marking: 'W-02', status: 'Delayed', 'updated on': '2024-05-15' },
        { 'IFC Guide': ' guid-1 ', Marking: 'W-01', status: 'Completed', 'updated on': new Date(2024, 4, 16) },
        { 'IFC Guide': 'guid-1', status: 'Pending', 'updated on': 'not a date' },
        { 'IFC Guide': 'guid-1', status: 'On Hold' }
    ]);

    const records = context.importedDataMap.get('guid-1');
    assert.deepEqual(Array.from(records, record => record.status), ['Completed', 'In Progress', 'Pending', 'On Hold']);
    assert.deepEqual(Array.from(records.slice(0, 2), record => record.updatedOn), ['2024-05-16', '2024-05-15']);
    assert.equal(context.importStatus.innerText, 'Loaded 5 records.');
    assert.equal(context.applyStatusColors(), 1);
    assert.equal(mesh.material.color.value, '#00ff88');

    await context.showElementProperties(0, 1);
    const rows = tabContentContainer.children[0].children.filter(row => row.className === 'prop-row');
    const values = rows.map(row => row.children.map(child => child.textContent));
    assert.deepEqual(values.filter(row => row[0] === 'Status').map(row => row[1]), ['Completed', 'In Progress', 'Pending', 'On Hold']);
    assert.deepEqual(values.filter(row => row[0] === 'Updated On').map(row => row[1]), ['2024-05-16', '2024-05-15', 'not a date']);
});

test('replacing imported data clears old history and preserves a single record', async () => {
    const { context, tabContentContainer } = createHarness();
    context.processImportedData([{ 'IFC Guide': 'guid-1', status: 'Delayed', 'updated on': '2024-05-15' }]);
    context.processImportedData([{ 'IFC Guide': 'guid-1', status: 'Pending', 'updated on': '2024-05-16' }]);
    assert.equal(context.importedDataMap.get('guid-1').length, 1);
    await context.showElementProperties(0, 1);
    const rows = tabContentContainer.children[0].children.filter(row => row.className === 'prop-row');
    assert.equal(rows.some(row => row.children[0].textContent === 'Record'), false);
    assert.equal(rows.find(row => row.children[0].textContent === 'Status').children[1].textContent, 'Pending');
});
