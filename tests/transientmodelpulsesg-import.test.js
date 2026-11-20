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
    const tabNav = element();
    const mesh = { isMesh: true, userData: { expressID: 1 }, material: { name: 'original' } };
    const elements = {
        'btn-play-status': element(),
        'status-playback-position': element(),
        'status-playback-speed': { value: '1' }
    };
    const timers = new Map();
    const toasts = [];
    let timerId = 0;
    const context = vm.createContext({
        Date, Map, Set, Number, String, Promise,
        setTimeout: callback => callback(),
        setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearInterval: id => timers.delete(id),
        importedDataMap: new Map(),
        importStatus: {},
        selectedMeshes: new Map(),
        selectedOriginalMaterials: new Map(),
        statusColoredMeshes: new Set(),
        statusTimeline: [], statusTimelineIndex: 0, statusPlaying: false, statusTimer: null,
        statusPlaybackOriginals: new Map(), statusPlaybackMaterials: new Map(),
        guidToMeshMap: new Map([['guid-1', mesh]]),
        inspectorPanel: element(),
        tabNav,
        tabContentContainer,
        searchInput: {},
        currentModelID: 0,
        currentIfcModel: { children: [mesh] },
        showToast: (message, type) => toasts.push({ message, type }),
        safeExpressID: id => id,
        ifcAPI: {
            GetLine: () => ({ GlobalId: { value: 'guid-1' }, type: 'IFCWALL' }),
            properties: { getPropertySets: () => [] }
        },
        iterateCollection() {},
        document: { createElement: element, querySelectorAll: () => [], getElementById: id => elements[id] },
        THREE: { Color: class { constructor(value) { this.value = value; } clone() { return this; } multiplyScalar() { return this; } } },
        selectedMaterial: { clone: () => ({ name: 'selected' }) },
        sharedDefaultMaterial: { clone: () => ({ dispose() { this.disposed = true; } }) }
    });
    vm.runInContext(
        section('        function normalizeImportedDate(', '        // Central color map') +
        section('        const STATUS_COLOR_MAP', '        // Populate the Status Legend') +
        section('        function applyStatusColors()', "        document.getElementById('btn-load-sample')") +
        section('        async function showElementProperties(', '        async function runSGValidation('),
        context
    );
    return { context, mesh, tabNav, tabContentContainer, elements, timers, toasts };
}

test('shows IFC attributes, type property sets, and zero quantities in separate tabs', async () => {
    const { context, tabNav, tabContentContainer } = createHarness();
    const ref = value => ({ value });
    const lines = {
        1: { GlobalId: ref('guid-1'), type: 'IFCWALL', Name: ref('Wall'), Description: ref('External wall'), IsDefinedBy: [ref(10), ref(11)] },
        10: { RelatingPropertyDefinition: ref(20) },
        11: { RelatingType: ref(30) },
        20: { Name: ref('BaseQuantities'), Quantities: [ref(21)] },
        21: { Name: ref('NetVolume'), VolumeValue: ref(0) },
        30: { HasPropertySets: [ref(31)] },
        31: { Name: ref('Pset_WallCommon'), HasProperties: [ref(32)] },
        32: { Name: ref('LoadBearing'), NominalValue: ref(false) }
    };
    context.ifcAPI.GetLine = (_model, id) => lines[id];
    context.safeExpressID = item => typeof item === 'number' ? item : item.value;
    context.iterateCollection = (items, callback) => items?.forEach(callback);
    vm.runInContext(section('        function extractValue(', '        async function getPsetsAsMap('), context);
    await context.showElementProperties(0, 1);
    assert.deepEqual(tabNav.children.map(tab => tab.innerText), ['Attributes', '[Qto] BaseQuantities', 'Pset_WallCommon']);
    const rows = content => content.children.map(row => row.children.map(child => child.textContent));
    assert.ok(rows(tabContentContainer.children[0]).some(row => row[0] === 'Description' && row[1] === 'External wall'));
    assert.deepEqual(rows(tabContentContainer.children[1]), [['NetVolume', 0]]);
    assert.deepEqual(rows(tabContentContainer.children[2]), [['LoadBearing', false]]);
});

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

test('displays and sorts numeric and text Excel serial dates for the same GUID', async () => {
    const { context, mesh, tabContentContainer } = createHarness();
    context.processImportedData([
        { 'IFC Guide': 'guid-1', status: 'In Progress', 'updated on': 45427 },
        { 'IFC Guide': 'guid-1', status: 'Delayed', 'updated on': '45426' },
        { 'IFC Guide': 'guid-1', status: 'Completed', 'updated on': '45428.5' },
        { 'IFC Guide': 'guid-2', status: 'Pending', 'updated on': 45430 }
    ]);

    await context.showElementProperties(0, 1);
    const rows = tabContentContainer.children[0].children.filter(row => row.className === 'prop-row');
    const values = rows.map(row => row.children.map(child => child.textContent));
    assert.deepEqual(values.filter(row => row[0] === 'Status').map(row => row[1]), ['Completed', 'In Progress', 'Delayed']);
    assert.deepEqual(values.filter(row => row[0] === 'Updated On').map(row => row[1]), ['2024-05-16', '2024-05-15', '2024-05-14']);
    context.applyStatusColors();
    assert.equal(mesh.material.color.value, '#00ff88');
});

test('uses the workbook date system when importing numeric Excel cells', () => {
    const { context } = createHarness();
    let onChange;
    const getElementById = context.document.getElementById;
    context.document.getElementById = id => id === 'data-import-input'
        ? { addEventListener: (_event, handler) => { onChange = handler; } }
        : getElementById(id);
    context.XLSX = {
        read: () => ({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
            Workbook: { WBProps: { date1904: true } }
        }),
        utils: { sheet_to_json: () => [{ 'IFC Guide': 'guid-1', status: 'Completed', 'updated on': 43965 }] }
    };
    context.FileReader = class {
        readAsBinaryString() { this.onload({ target: { result: 'workbook' } }); }
    };
    vm.runInContext(section("        document.getElementById('data-import-input')", '        function normalizeImportedDate('), context);
    onChange({ target: { files: [{ name: 'data.xlsx' }] } });

    assert.equal(context.importedDataMap.get('guid-1')[0].updatedOn, '2024-05-15');
    assert.equal(context.normalizeImportedDate(0, true), '1904-01-01');
    assert.equal(context.normalizeImportedDate(59), '1900-02-28');
    assert.equal(context.normalizeImportedDate(61), '1900-03-01');
});

test('plays matching status dates in ascending order, pauses, changes speed and restores colors', () => {
    const { context, mesh, elements, timers, toasts } = createHarness();
    const original = mesh.material;
    const part = { isMesh: true, userData: { expressID: 1 }, material: { name: 'part-original' } };
    const unrelated = { isMesh: true, userData: { expressID: 2 }, material: { name: 'unrelated' } };
    context.currentIfcModel.children.push(part, unrelated);
    context.processImportedData([
        { 'IFC Guide': 'guid-1', status: 'Completed', 'updated on': '2024-05-16' },
        { 'IFC Guide': 'guid-1', status: 'In Progress', 'updated on': '2024-05-15' },
        { 'IFC Guide': 'guid-1', status: 'Delayed', 'updated on': 'bad date' },
        { 'IFC Guide': 'unmatched', status: 'Pending', 'updated on': '2024-05-14' }
    ]);

    context.playStatusPlayback();
    assert.equal(mesh.material.color.value, '#ffc400');
    assert.equal(part.material.color.value, '#ffc400');
    assert.equal(unrelated.material.name, 'unrelated');
    assert.equal(elements['status-playback-position'].textContent, 'Date: 2024-05-15 (1/2)');
    assert.equal([...timers.values()][0].delay, 1000);
    assert.ok(toasts.some(toast => toast.message.includes('Skipped 1')));

    context.playStatusPlayback();
    assert.equal(timers.size, 0);
    assert.equal(mesh.material.color.value, '#ffc400');
    elements['status-playback-speed'].value = '2';
    context.playStatusPlayback();
    assert.equal([...timers.values()][0].delay, 500);
    [...timers.values()][0].callback();
    assert.equal(mesh.material.color.value, '#00ff88');
    assert.equal(part.material.color.value, '#00ff88');
    assert.equal(elements['status-playback-position'].textContent, 'Date: 2024-05-16 (2/2)');
    assert.equal(timers.size, 0);
    const lastMaterial = mesh.material;
    context.resetStatusPlayback();
    assert.equal(mesh.material, original);
    assert.equal(part.material.name, 'part-original');
    assert.equal(lastMaterial.disposed, true);
});

test('applies records on the same date together and stops playback when data is replaced', () => {
    const { context, mesh, timers } = createHarness();
    const other = { isMesh: true, userData: { expressID: 2 }, material: { name: 'other-original' } };
    context.currentIfcModel.children.push(other);
    context.guidToMeshMap.set('guid-2', other);
    context.processImportedData([
        { 'IFC Guide': 'guid-1', status: 'In Progress', 'updated on': '2024-05-15' },
        { 'IFC Guide': 'guid-2', status: 'Delayed', 'updated on': '2024-05-15' },
        { 'IFC Guide': 'guid-1', status: 'Completed', 'updated on': '2024-05-16' }
    ]);
    context.playStatusPlayback();
    assert.equal(mesh.material.color.value, '#ffc400');
    assert.equal(other.material.color.value, '#ff007f');
    assert.equal(timers.size, 1);
    context.processImportedData([{ 'IFC Guide': 'guid-1', status: 'Pending', 'updated on': '2024-05-17' }]);
    assert.equal(timers.size, 0);
    assert.equal(mesh.material.name, 'original');
    assert.equal(other.material.name, 'other-original');
});

test('reports when no matching dated statuses can be played', () => {
    const { context, timers, toasts } = createHarness();
    context.processImportedData([{ 'IFC Guide': 'guid-1', status: 'Pending', 'updated on': 'invalid' }]);
    context.playStatusPlayback();
    assert.equal(timers.size, 0);
    assert.ok(toasts.some(toast => toast.type === 'error' && toast.message.includes('No matching status records')));
});

test('reschedules an active timeline and restores selection on reset and replay', () => {
    const { context, mesh, elements, timers } = createHarness();
    const original = mesh.material;
    context.selectedMeshes.set(1, mesh);
    context.selectedOriginalMaterials.set(1, original);
    mesh.material = { name: 'selected' };
    context.processImportedData([
        { 'IFC Guide': 'guid-1', status: 'In Progress', 'updated on': '2024-05-15' },
        { 'IFC Guide': 'guid-1', status: 'Completed', 'updated on': '2024-05-16' }
    ]);
    context.playStatusPlayback();
    elements['status-playback-speed'].value = '4';
    context.scheduleStatusPlayback();
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 250);
    [...timers.values()][0].callback();
    context.playStatusPlayback();
    assert.equal(mesh.material.color.value, '#ffc400');
    context.resetStatusPlayback();
    assert.equal(timers.size, 0);
    assert.equal(mesh.material.name, 'selected');
    assert.equal(context.selectedOriginalMaterials.get(1), original);
    assert.equal(context.statusColoredMeshes.has(mesh), false);
});
