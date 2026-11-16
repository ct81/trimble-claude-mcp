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
