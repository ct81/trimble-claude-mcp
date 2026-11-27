import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/sitepulse/sitepulse.html', import.meta.url), 'utf8');

class Element {
    children = [];
    listeners = {};
    addEventListener(event, handler) { this.listeners[event] = handler; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
}
class Group {
    children = [];
    visible = true;
    add(child) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = this;
        this.children.push(child);
    }
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
    const elements = Object.fromEntries(['model-transparency', 'model-transparency-value', 'model-layers', 'btn-show-all', 'btn-isolate']
        .map(id => [id, new Element()]));
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
                { id: 11, type: 'IfcSpace', children: [{ id: 12, children: [] }, { id: 13, children: [] }] }
            ] },
            { id: 20, type: 'IFCBUILDINGSTOREY', name: 'Level 2', children: [{ id: 21, children: [] }] }
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
    assert.equal(context.isIsolated, false);
});

test('SitePulse module scripts parse', () => {
    for (const [, attributes, source] of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc=|type=["']importmap/i.test(attributes)) continue;
        const withoutImports = source.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');
        assert.doesNotThrow(() => new vm.Script(withoutImports));
    }
});
