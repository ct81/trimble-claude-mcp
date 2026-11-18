import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Break Time tabs switch panels and load only the active game', () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const view = page.slice(page.indexOf('<div class="sp-view" id="viewBreak"'), page.indexOf('  </section>', page.indexOf('<div class="sp-view" id="viewBreak"')));
    const markup = [...view.matchAll(/<button class="break-tab" id="([^"]+)"[^>]*aria-selected="([^"]+)" aria-controls="([^"]+)"[^>]*>/g)];
    assert.equal(markup.length, 5);
    assert.match(view, /data-src="misc\/game_macross\.html"/);
    assert.match(view, /id="breakPanel2"[^>]*>[\s\S]*?<iframe id="teeniepingFrame"[^>]*data-src="misc\/game_teenieping\.html"/);
    assert.match(view, /id="breakPanel3"[^>]*>[\s\S]*?<iframe id="pacdjFrame"[^>]*data-src="misc\/game_pacdj\.html"/);
    assert.match(view, /id="breakPanel4"[^>]*>[\s\S]*?<iframe id="racingFrame"[^>]*data-src="misc\/game_racing\.html"/);
    assert.match(view, /id="breakPanel5"[^>]*>[\s\S]*?<iframe id="footballkickFrame"[^>]*data-src="misc\/game_footballkick\.html"/);
    assert.doesNotMatch(page, /id="railTeenieping"|id="viewTeenieping"/);

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
    for (const id of ['sidepanel', 'viewChat', 'viewAgent', 'viewBug', 'viewBreak', 'railChat', 'railAgent', 'railBug', 'railBreak', 'spTitle', 'breakFrame', 'teeniepingFrame', 'pacdjFrame', 'racingFrame', 'footballkickFrame']) elements[id] = element();
    elements.breakFrame.dataset.src = 'misc/game_macross.html';
    elements.teeniepingFrame.dataset.src = 'misc/game_teenieping.html';
    elements.pacdjFrame.dataset.src = 'misc/game_pacdj.html';
    elements.racingFrame.dataset.src = 'misc/game_racing.html';
    elements.footballkickFrame.dataset.src = 'misc/game_footballkick.html';
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
    assert.equal(elements.teeniepingFrame.attributes.src, 'misc/game_teenieping.html');
    assert.equal(elements.breakPanel1.hidden, true);
    assert.equal(elements.breakPanel2.hidden, false);
    assert.equal(tabs[1].attributes['aria-selected'], 'true');
    tabs[2].listeners.click();
    assert.equal(elements.teeniepingFrame.hasAttribute('src'), false);
    assert.equal(elements.pacdjFrame.attributes.src, 'misc/game_pacdj.html');
    assert.equal(elements.breakPanel3.hidden, false);
    tabs[3].listeners.click();
    assert.equal(elements.breakPanel4.hidden, false);
    assert.equal(elements.pacdjFrame.hasAttribute('src'), false);
    assert.equal(elements.racingFrame.attributes.src, 'misc/game_racing.html');
    tabs[1].listeners.keydown({ key: 'End', preventDefault() {} });
    assert.equal(tabs[4].focused, true);
    assert.equal(elements.breakPanel5.hidden, false);
    assert.equal(elements.breakPanel4.hidden, true);
    assert.equal(elements.racingFrame.hasAttribute('src'), false);
    assert.equal(elements.footballkickFrame.attributes.src, 'misc/game_footballkick.html');
    elements.railBreak.listeners.click();
    assert.equal(elements.footballkickFrame.hasAttribute('src'), false);
    elements.railBreak.listeners.click();
    assert.equal(elements.footballkickFrame.attributes.src, 'misc/game_footballkick.html');
    tabs[4].listeners.keydown({ key: 'Home', preventDefault() {} });
    assert.equal(elements.breakFrame.attributes.src, 'misc/game_macross.html');
    assert.equal(elements.footballkickFrame.hasAttribute('src'), false);
    tabs[1].listeners.click();
    assert.equal(elements.breakFrame.hasAttribute('src'), false);
    assert.equal(elements.teeniepingFrame.attributes.src, 'misc/game_teenieping.html');
    elements.railBreak.listeners.click();
    assert.equal(elements.teeniepingFrame.hasAttribute('src'), false);
    elements.railBreak.listeners.click();
    assert.equal(elements.teeniepingFrame.attributes.src, 'misc/game_teenieping.html');
    elements.railChat.listeners.click();
    assert.equal(elements.teeniepingFrame.hasAttribute('src'), false);
    elements.railBreak.listeners.click();
    tabs[2].listeners.click();
    elements.railBreak.listeners.click();
    assert.equal(elements.pacdjFrame.hasAttribute('src'), false);
    elements.railBreak.listeners.click();
    assert.equal(elements.pacdjFrame.attributes.src, 'misc/game_pacdj.html');
});
