import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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
    const start = page.indexOf('        async function selectAllAndValidateSG()');
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
    const helperStart = page.indexOf('        async function selectAllAndValidateSG()');
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
