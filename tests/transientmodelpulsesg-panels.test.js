import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('day/night background toggle updates fog without overriding the fog setting', () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    assert.match(page, /id="btn-day-night"[^>]*>[\s\S]*?<\/button>\s*<button[^>]*id="btn-fullscreen"/);
    const start = page.indexOf('        const btnDayNight =');
    const end = page.indexOf("        document.getElementById('set-selbox')", start);
    assert.ok(start >= 0 && end > start);
    const button = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(_type, callback) { this.click = callback; }
    };
    const fogSetting = {
        checked: true,
        addEventListener(_type, callback) { this.change = callback; }
    };
    let dayMode = false;
    const scene = {};
    const context = vm.createContext({
        document: { getElementById: id => id === 'btn-day-night' ? button : fogSetting },
        container: { classList: { toggle(_name, enabled) { dayMode = enabled; } } },
        scene,
        THREE: { FogExp2: class { constructor(color, density) { this.color = color; this.density = density; } } }
    });
    vm.runInContext(page.slice(start, end), context);

    button.click();
    assert.equal(dayMode, true);
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.match(button.title, /night/);
    assert.equal(scene.fog.color, 0xcbdced);

    fogSetting.checked = false;
    fogSetting.change();
    assert.equal(scene.fog, null);
    button.click();
    assert.equal(dayMode, false);
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.match(button.title, /day/);
    assert.equal(scene.fog, null);

    fogSetting.checked = true;
    fogSetting.change();
    assert.equal(scene.fog.color, 0x05070a);
    button.click();
    assert.equal(scene.fog.color, 0xcbdced);
});

test('the initially hidden Crane Manager can be reopened from the toolbar', () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const craneButton = page.match(/<button class="toolbar-btn reopen" data-panel="([^"]*)"[^>]*\s+title="Reopen Crane Manager"/);
    const cranePanel = page.match(/<div class="floating-controls" id="crane-panel" style="([^"]*)">/);
    assert.ok(craneButton);
    assert.ok(cranePanel);

    const panel = {
        style: { display: cranePanel[1].match(/display:\s*([^;]+)/)[1] },
        classList: { remove() {} },
        querySelector: () => ({ innerText: 'Crane Manager' })
    };
    const button = {
        dataset: { panel: craneButton[1] },
        style: { display: 'none' },
        addEventListener(_type, callback) { this.click = callback; }
    };
    const context = vm.createContext({
        document: {
            querySelectorAll: () => [button],
            getElementById: id => id === 'crane-panel' ? panel : null
        },
        minimizedDock: { children: [] },
        MutationObserver: class { observe() {} },
        showToast() {}
    });
    const start = page.indexOf('        const reopenBtns =');
    const end = page.indexOf("        document.querySelectorAll('.chart-container')", start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(page.slice(start, end), context);

    assert.equal(button.style.display, 'inline-flex');
    button.click();
    assert.equal(panel.style.display, 'flex');
    assert.equal(button.style.display, 'none');
    panel.style.display = 'none';
    context.refreshReopenButtons();
    assert.equal(button.style.display, 'inline-flex');
    button.click();
    assert.equal(panel.style.display, 'flex');
});

test('checking select all validates every model mesh; unchecking does nothing', () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const start = page.indexOf('        function selectAllModelMeshes()');
    const end = page.indexOf('\n\n', start);
    assert.ok(start >= 0 && end > start);
    assert.match(page, /<label for="set-validate-all">[^<]+<\/label><input type="checkbox" id="set-validate-all">/);

    const checkbox = { checked: false, addEventListener(_type, callback) { this.change = callback; } };
    const selectedMeshes = new Map([[99, {}]]);
    const validations = [];
    const toasts = [];
    const context = vm.createContext({
        document: { getElementById: () => checkbox },
        selectedMeshes,
        currentIfcModel: {
            traverse(callback) {
                [{ isMesh: true, userData: { expressID: 1 }, visible: true },
                    { isMesh: true, userData: { expressID: 2 }, visible: false },
                    { isMesh: false }].forEach(callback);
            }
        },
        currentModelID: 0,
        clearSelection: () => selectedMeshes.clear(),
        addMeshToSelection: mesh => selectedMeshes.set(mesh.userData.expressID, mesh),
        runSGValidation: async ids => validations.push(Array.from(ids)),
        showToast: (...args) => toasts.push(args)
    });
    vm.runInContext(page.slice(start, end), context);

    checkbox.checked = true;
    checkbox.change({ target: checkbox });
    assert.deepEqual(validations, [[1, 2]]);
    assert.deepEqual([...selectedMeshes.keys()], [1, 2]);
    checkbox.checked = false;
    checkbox.change({ target: checkbox });
    assert.equal(validations.length, 1);

    context.currentIfcModel = null;
    checkbox.checked = true;
    checkbox.change({ target: checkbox });
    assert.equal(checkbox.checked, false);
    assert.deepEqual(toasts, [['Load a model first.', 'error']]);
    assert.equal(validations.length, 1);
});

test('successful IFC loads validate the newly loaded meshes only when enabled', async () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const start = page.indexOf('        async function processAndAddModel(');
    const end = page.indexOf('        function clearSelection()', start);
    const helperStart = page.indexOf('        function selectAllModelMeshes()');
    const helperEnd = page.indexOf("        document.getElementById('set-validate-all').addEventListener", helperStart);
    assert.ok(start >= 0 && end > start && helperStart >= 0 && helperEnd > helperStart);

    const checkbox = { checked: false };
    const selectedMeshes = new Map();
    const validations = [];
    const toasts = [];
    let id = 0;
    let fail = false;
    class Group {
        constructor() { this.children = []; }
        add(mesh) { this.children.push(mesh); }
        traverse(callback) { this.children.forEach(callback); }
    }
    class Mesh {
        constructor(geometry, material) { this.geometry = geometry; this.material = material; this.isMesh = true; this.userData = {}; this.matrix = {}; }
        updateMatrix() {}
    }
    class Box {
        setFromObject() { return this; }
        copy() { return this; }
        applyMatrix4() { this.min = { y: 0 }; return this; }
        getCenter() { return {}; }
        getSize() { return { x: 1, y: 1, z: 1 }; }
    }
    class Geometry {
        constructor() { this.boundingBox = {}; }
        setAttribute() {}
        setIndex() {}
        computeBoundingBox() {}
        computeBoundingSphere() {}
        dispose() {}
    }
    const context = vm.createContext({
        document: { getElementById: name => name === 'set-validate-all' ? checkbox : { value: '' } },
        THREE: { Group, Mesh, Box3: Box, Vector3: class {}, Matrix4: class {}, BufferGeometry: Geometry,
            InterleavedBuffer: class {}, InterleavedBufferAttribute: class {}, BufferAttribute: class {} },
        ifcAPI: {
            OpenModel() { if (fail) throw new Error('bad IFC'); return ++id; },
            CloseModel() {},
            StreamAllMeshes(_model, callback) {
                callback({ expressID: id, geometries: { size: () => 1, get: () => ({ geometryExpressID: 1 }) } });
            },
            GetGeometry: () => ({ GetVertexData() {}, GetVertexDataSize() {}, GetIndexData() {}, GetIndexDataSize() {}, delete() {} }),
            GetVertexArray: () => new Float32Array(6),
            GetIndexArray: () => new Uint32Array([0]),
            GetLine: () => ({ GlobalId: { value: 'guid' } })
        },
        resetStatusPlayback() {}, clearInterval() {}, updatePlayButton() {}, resetIfcEngine: async () => {},
        clearSelection: () => selectedMeshes.clear(),
        addMeshToSelection: mesh => selectedMeshes.set(mesh.userData.expressID, mesh),
        runSGValidation: async ids => validations.push(Array.from(ids)),
        showToast: (...args) => toasts.push(args),
        showLoading() {}, hideLoading() {}, renderExplorer() {}, refreshExplorer() {},
        scene: { add() {}, remove() {} }, renderer: { renderLists: { dispose() {} } },
        controls: { target: { copy() {} }, update() {} }, camera: { position: { set() {} } },
        sharedDefaultMaterial: {}, selectedMaterial: {},
        currentModelID: -1, currentIfcModel: null, currentIfcFilename: '', animTimer: null, selectedMeshes,
        colorByMaterials: [], statusColoredMeshes: new Set(), guidToMeshMap: new Map(), elementPsetCache: new Map(),
        explorerSearch: { value: '' }, explorerPanel: { style: { display: 'none' } },
        progressContainer: { style: {} }, progressBar: { style: {} }, loadStatus: {}, loadTitle: {},
        safeExpressID: value => value, sanitizeVertexArray: value => value, sanitizeIndexArray: value => value,
        setTimeout: callback => callback(), console: { error() {} }
    });
    vm.runInContext(page.slice(start, end) + page.slice(helperStart, helperEnd), context);

    await context.processAndAddModel(new ArrayBuffer(8), 'first.ifc');
    assert.deepEqual(validations, []);
    checkbox.checked = true;
    await context.processAndAddModel(new ArrayBuffer(8), 'second.ifc');
    assert.deepEqual(validations, [[2]]);
    await context.processAndAddModel(new ArrayBuffer(8), 'third.ifc');
    assert.deepEqual(validations, [[2], [3]]);
    assert.deepEqual([...selectedMeshes.keys()], [3]);
    fail = true;
    await context.processAndAddModel(new ArrayBuffer(8), 'bad.ifc');
    assert.deepEqual(validations, [[2], [3]]);
    assert.ok(toasts.some(([message, type]) => type === 'error' && message.includes('bad IFC')));
});

test('validation Excel tabs are matched by Global ID and compared with model data', () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    assert.match(page, /<label for="set-validation-excel">[^<]+<\/label>\s*<input type="file" id="set-validation-excel" accept="\.xlsx,\.xls">/);
    const start = page.indexOf('        const excelSheetName =');
    const end = page.indexOf('        let validationWorkbook = null;', start);
    assert.ok(start >= 0 && end > start);
    const context = vm.createContext({});
    vm.runInContext(page.slice(start, end), context);

    const guid = '1lvARv9sHCVhmq2Wt7kpls';
    const sheets = {
        Attributes: [{ 'Express ID': 10945, 'Global ID': guid, Type: 'IfcWall', Name: '8LPW1E' }],
        Pset_WallCommon: [{ 'Express ID': 10945, 'Global ID': guid, Name: '8LPW1E', LoadBearing: true, Reference: 'Concrete_W-1/0(?)' }],
        'Tekla Common': [{ 'Express ID': 10945, 'Global ID': guid, Name: '8LPW1E', Finish: '', 'Top elevation': ' +32.100', Phase: 1 }],
        'Tekla Quantity': [{ 'Express ID': 10945, 'Global ID': guid, Name: '8LPW1E', Volume: 2.6, Height: 3179 }],
        Notes: [{ Comment: 'no GUID' }],
        Other: [{ 'Global ID': 'other-guid', Value: 1 }, { 'Global ID': 'other-guid', Value: 2 }]
    };
    const workbook = context.parseValidationWorkbook(
        { SheetNames: Object.keys(sheets), Sheets: sheets },
        { utils: { sheet_to_json: rows => rows } }
    );
    assert.equal(workbook.guidCount, 2);
    assert.deepEqual([...workbook.issues], [
        'Tab "Notes" has no Global ID column and was skipped.',
        'Tab "Other" has duplicate Global ID other-guid; the first row was used.'
    ]);
    assert.deepEqual([...workbook.sheets[1].columns], ['LoadBearing', 'Reference']);

    const element = (overrides = {}) => ({
        globalId: guid,
        attributes: new Map([['Type', 'IFCWALL'], ['Name', '8LPW1E']]),
        psets: new Map([
            ['Pset_WallCommon', new Map([['LoadBearing', true], ['Reference', 'Concrete_W-1/0(?)']])],
            ['Tekla Common', new Map([['Top elevation', ' +32.100'], ['Phase', '1']])],
            ['Tekla Quantity', new Map([['Volume', 2.6000000000001], ['Height', 3179]])]
        ]),
        ...overrides
    });
    const matching = context.compareElementWithExcel(element(), workbook);
    assert.equal(matching.matchedTabs, 4);
    assert.equal(matching.errors.length, 0);

    const changed = element();
    changed.attributes.set('Name', 'Changed');
    changed.psets.get('Pset_WallCommon').set('LoadBearing', false);
    changed.psets.get('Tekla Common').delete('Phase');
    changed.psets.delete('Tekla Quantity');
    assert.deepEqual(JSON.parse(JSON.stringify(context.compareElementWithExcel(changed, workbook).errors)), [
        { type: 'Value Mismatch', detail: 'Tab "Attributes": Name — Excel "8LPW1E", model "Changed".' },
        { type: 'Value Mismatch', detail: 'Tab "Pset_WallCommon": LoadBearing — Excel "true", model "false".' },
        { type: 'Missing Property', detail: 'Tab "Tekla Common": Phase is "1" in Excel but missing in the model.' },
        { type: 'Missing Property Set', detail: 'Tab "Tekla Quantity": property set was not found on the model element.' }
    ]);
    assert.equal(context.compareElementWithExcel(element({ globalId: 'missing' }), workbook).matchedTabs, 0);
});

test('loading validation Excel compares only when select all validation is enabled', async () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const start = page.indexOf("        validationExcelInput.addEventListener('change'");
    const end = page.indexOf("        compareExcelButton.addEventListener('click'", start);
    assert.ok(start >= 0 && end > start);

    const validateAll = { checked: false };
    const input = {
        files: [], value: 'file',
        addEventListener(_type, callback) { this.change = callback; }
    };
    const selectedMeshes = new Map([[99, {}]]);
    const comparisons = [];
    const toasts = [];
    const context = vm.createContext({
        document: { getElementById: () => validateAll },
        validationExcelInput: input,
        validationExcelStatus: {},
        compareExcelButton: { disabled: true },
        XLSX: { read: () => ({}) },
        parseValidationWorkbook: () => ({ sheets: [{}], guidCount: 1, issues: [] }),
        validationWorkbook: null,
        currentIfcModel: {},
        currentModelID: 0,
        selectAllModelMeshes() {
            selectedMeshes.clear();
            selectedMeshes.set(1, {}).set(2, {});
        },
        compareSelectedWithExcel: async () => comparisons.push([...selectedMeshes.keys()]),
        showToast: (...args) => toasts.push(args)
    });
    vm.runInContext(page.slice(start, end), context);
    const upload = () => {
        input.files = [{ name: 'check.xlsx', arrayBuffer: async () => new ArrayBuffer(0) }];
        return input.change();
    };

    await upload();
    assert.deepEqual(comparisons, []);
    assert.deepEqual([...selectedMeshes.keys()], [99]);
    assert.equal(context.compareExcelButton.disabled, false);
    assert.match(toasts[0][0], /Click Compare Selected with Excel/);

    validateAll.checked = true;
    await upload();
    assert.deepEqual(comparisons, [[1, 2]]);
});
