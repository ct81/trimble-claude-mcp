import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dxfTextToRecords } from '../src/AI_RoachHarbor/dxf-text.js';
import { extractGridlineData } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';
import { brainToTekla } from '../src/AI_RoachHarbor/brain-tekla.js';

const dxf = [
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LINE', 5, 'line', 8, 'S-_ANOTGRID_E', 10, 100, 20, 200, 30, 0, 11, 100, 21, 1000, 31, 0,
    0, 'LINE', 5, 'secondary', 8, 'S-_ANOTGRID_E2', 10, 300, 20, 200, 30, 0, 11, 300, 21, 1000, 31, 0,
    0, 'TEXT', 5, 'label', 8, 'S-_ANOTGRID_T', 10, 100, 20, 1100, 30, 0, 40, 50, 1, 'A',
    0, 'CIRCLE', 5, 'bubble', 8, 'S-_ANOTGRID_T2', 10, 100, 20, 1100, 30, 0, 40, 100,
    0, 'ARC', 5, 'arc', 8, 'S-_ANOTGRID_E', 10, 0, 20, 0, 30, 0, 40, 500, 50, -75, 51, 90,
    0, 'LINE', 5, 'other', 8, 'OTHER', 10, 0, 20, 0, 11, 5, 21, 5,
    0, 'ENDSEC', 0, 'EOF'
].join('\n');

test('extracts plain grid entities with labels, coordinates and arc angles from all four layers', () => {
    const records = dxfTextToRecords(dxf);
    const gridlines = extractGridlineData(records);
    assert.equal(gridlines.length, 5);
    assert.deepEqual(gridlines[0].startPoint, { x: 100, y: 200, z: 0 });
    assert.deepEqual(gridlines[0].endPoint, { x: 100, y: 1000, z: 0 });
    assert.equal(gridlines[2].label, 'A');
    assert.equal(gridlines[2].radius, undefined);
    assert.deepEqual(gridlines[3].center, { x: 100, y: 1100, z: 0 });
    assert.equal(gridlines[3].radius, 100);
    assert.equal(gridlines[4].startAngle, -75);
    assert.equal(gridlines[4].endAngle, 90);
    assert.equal(gridlines[4].radius, 500);
});

test('grid extraction is opt-in and does not create unsupported grid MCP calls', () => {
    const records = dxfTextToRecords(dxf);
    const without = brainToTekla(records, ['column']);
    const withGrid = brainToTekla(records, ['column', 'gridline']);
    assert.deepEqual(without.gridlines, []);
    assert.equal(withGrid.gridlines.length, 5);
    assert.deepEqual(withGrid.calls, without.calls);
    assert.equal(brainToTekla(records, ['gridline']).calls.length, 0);
});

test('a grid-only Brain run exposes extracted entities as workflow rows', async () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    assert.match(page, /type="checkbox" class="fl" data-k="type_gridline"/);
    const start = page.indexOf('      if (cur.type === "brain") {');
    const end = page.indexOf('      if (cur.type === "mcp") {', start);
    assert.ok(start >= 0 && end > start);
    const state = { fileText: dxf };
    const status = {};
    const el = { querySelector: () => status };
    const context = vm.createContext({
        state,
        cur: { type: 'brain', el },
        readFlow: () => ({ script: 'supraesophageal_ganglion_4_dxf.js', type_gridline: true }),
        ensureToken: async () => 'test',
        fetch: async (_url, options) => {
            const body = JSON.parse(options.body);
            assert.deepEqual(body.types, ['gridline']);
            return { ok: true, json: async () => brainToTekla(dxfTextToRecords(body.dxfText), body.types) };
        },
        renderBrain() {}
    });
    await vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
    assert.equal(state.rows.length, 5);
    assert.equal(state.brainCalls.length, 0);
    assert.equal(state.result.result.structuredContent.gridlines[2].label, 'A');
    assert.match(status.textContent, /5 grid entities extracted/);
});

test('grid-only MCP execution reports why no grid creation request was sent', async () => {
        const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
        const start = page.indexOf('      if (cur.type === "mcp") {');
        const end = page.indexOf('      if (cur.type === "api") {', start);
        const errors = [];
        let requests = 0;
        const context = vm.createContext({
            URL,
            state: { rows: extractGridlineData(dxfTextToRecords(dxf)), brainCalls: [] },
            cur: { type: 'mcp', el: { querySelector: selector => ({
                '.url': { value: 'https://mcp.test' },
                '.tool': { value: 'tekla_create_gridline' },
                '.args': { value: '{}' },
                '.status': {}
            })[selector] } },
            ensureToken: async () => 'test',
            callMcpTool: async () => { requests++; },
            console: { error: (...args) => errors.push(args) }
        });
        await assert.rejects(vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context), /No gridline request was sent/);
        assert.equal(requests, 0);
        assert.equal(errors.length, 1);
        assert.equal(errors[0][1].gridEntities, 5);
    });

test('MCP tool errors retain the bridge diagnostic text', async () => {
        const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
        const start = page.indexOf('async function callMcpTool(');
        const end = page.indexOf('async function runLoop(', start);
        const context = vm.createContext({
            ensureToken: async () => 'test',
            fetch: async () => ({
                ok: true,
                json: async () => ({ result: { isError: true, content: [{ type: 'text', text: 'Tekla bridge HTTP 400: parentGuid is required' }] } })
            })
        });
        vm.runInContext(page.slice(start, end), context);
        await assert.rejects(context.callMcpTool('https://mcp.test', 'tekla_create_gridline', {}), /parentGuid is required/);
    });
