import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Break Time tabs switch panels and load only the active game', () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const view = page.slice(page.indexOf('<div class="sp-view" id="viewBreak"'), page.indexOf('<div class="sp-view" id="viewTeenieping"'));
    const markup = [...view.matchAll(/<button class="break-tab" id="([^"]+)"[^>]*aria-selected="([^"]+)" aria-controls="([^"]+)"[^>]*>/g)];
    assert.equal(markup.length, 4);
    assert.match(view, /data-src="misc\/game_macross\.html"/);

    const elements = {};
    function element() {
        return {
            hidden: false, attributes: {}, dataset: {}, listeners: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            getAttribute(name) { return this.attributes[name]; },
            hasAttribute(name) { return name in this.attributes; },
            removeAttribute(name) { delete this.attributes[name]; },
            set src(value) { this.attributes.src = value; },
            addEventListener(name, callback) { this.listeners[name] = callback; },
            focus() { this.focused = true; }
        };
    }
    for (const id of ['sidepanel', 'viewChat', 'viewAgent', 'viewBug', 'viewBreak', 'viewTeenieping', 'railChat', 'railAgent', 'railBug', 'railBreak', 'railTeenieping', 'spTitle', 'breakFrame', 'teeniepingFrame']) elements[id] = element();
    elements.breakFrame.dataset.src = 'misc/game_macross.html';
    elements.teeniepingFrame.dataset.src = 'misc/game_teenieping.html';
    const tabs = markup.map(([, id, selected, controls]) => {
        const tab = elements[id] = element();
        tab.attributes['aria-selected'] = selected;
        tab.attributes['aria-controls'] = controls;
        elements[controls] = element();
        return tab;
    });
    const context = vm.createContext({
        document: { getElementById: id => elements[id], querySelectorAll: () => tabs },
        updateStageSize() {}, drawEdges() {}, fillWorkflows() {}, renderJobs() {}
    });
    const start = page.indexOf('  const panel = document.getElementById("sidepanel");');
    const end = page.indexOf('  /* ---- chat ---- */', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(page.slice(start, end), context);

    elements.railBreak.listeners.click();
    assert.equal(elements.breakFrame.attributes.src, 'misc/game_macross.html');
    tabs[1].listeners.click();
    assert.equal(elements.breakFrame.hasAttribute('src'), false);
    assert.equal(elements.breakPanel1.hidden, true);
    assert.equal(elements.breakPanel2.hidden, false);
    assert.equal(tabs[1].attributes['aria-selected'], 'true');
    tabs[1].listeners.keydown({ key: 'End', preventDefault() {} });
    assert.equal(tabs[3].focused, true);
    assert.equal(elements.breakPanel4.hidden, false);
    tabs[3].listeners.keydown({ key: 'Home', preventDefault() {} });
    assert.equal(elements.breakFrame.attributes.src, 'misc/game_macross.html');
    elements.railTeenieping.listeners.click();
    assert.equal(elements.breakFrame.hasAttribute('src'), false);
    assert.equal(elements.teeniepingFrame.attributes.src, 'misc/game_teenieping.html');
    elements.railTeenieping.listeners.click();
    assert.equal(elements.teeniepingFrame.hasAttribute('src'), false);
});
