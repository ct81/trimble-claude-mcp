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
    const start = page.indexOf("        document.getElementById('set-validate-all').addEventListener");
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
        runSGValidation: ids => validations.push(Array.from(ids)),
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
