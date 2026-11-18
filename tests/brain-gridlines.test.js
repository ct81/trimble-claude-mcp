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

const rectangularDxf = [
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LINE', 5, 'x1a', 8, 'S-_ANOTGRID_E', 10, 0, 20, -10, 11, 0, 21, 50,
    0, 'LINE', 5, 'x1b', 8, 'S-_ANOTGRID_E', 10, 0, 20, 50, 11, 0, 21, 110,
    0, 'LINE', 5, 'dup', 8, 'S-_ANOTGRID_E2', 10, 0, 20, 50, 11, 0, 21, 110,
    0, 'TEXT', 5, 'a', 8, 'S-_ANOTGRID_T', 10, 0, 20, 113, 40, 3, 1, 'A',
    0, 'CIRCLE', 5, 'bubble-a', 8, 'S-_ANOTGRID_T2', 10, 0, 20, 113, 40, 3,
    0, 'LINE', 5, 'x2', 8, 'S-_ANOTGRID_E', 10, 1000, 20, -10, 11, 1000, 21, 110,
    0, 'TEXT', 5, 'b', 8, 'S-_ANOTGRID_T', 10, 1000, 20, 113, 40, 3, 1, 'B',
    0, 'LINE', 5, 'y1', 8, 'S-_ANOTGRID_E', 10, -10, 20, 0, 11, 1010, 21, 0,
    0, 'TEXT', 5, 'one', 8, 'S-_ANOTGRID_T', 10, -13, 20, 0, 40, 3, 1, '1',
    0, 'LINE', 5, 'y2', 8, 'S-_ANOTGRID_E', 10, -10, 20, 100, 11, 1010, 21, 100,
    0, 'TEXT', 5, 'two', 8, 'S-_ANOTGRID_T', 10, -13, 20, 100, 40, 3, 1, '2',
    0, 'ARC', 5, 'curve', 8, 'S-_ANOTGRID_E', 10, 0, 20, 0, 40, 500, 50, 0, 51, 90,
    0, 'LINE', 5, 'diagonal', 8, 'S-_ANOTGRID_E', 10, 0, 20, 0, 11, 10, 21, 10,
    0, 'ENDSEC', 0, 'EOF'
].join('\n');

test('Call MCP offsets Brain coordinates without mutating Brain data or manual/template behavior', async () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('      if (cur.type === "mcp") {');
    const end = page.indexOf('      if (cur.type === "api") {', start);
    for (const scenario of [
        { x: -300, expected: 700 },
        { x: '250', expected: 1250 },
        { x: 0, expected: 1000 },
        { x: '', expected: 1000 },
        { expected: 1000 },
        { x: 'invalid', error: true },
        { x: false, error: true },
        { x: -300, manual: true, expected: -300 },
        { x: -300, templated: true, expected: -300 },
        { x: -300, tool: 'tekla_create_beam', expected: 700 }
    ]) {
        const tool = scenario.tool || 'tekla_create_column';
        const original = { x: 1000, y: 2000, z1: 0, z2: 3000, profile: '300*300' };
        const args = { ...(scenario.x === undefined ? {} : { x: scenario.x }),
            ...(scenario.templated ? { y: '{{row.y}}' } : {}) };
        const state = {
            rows: [{ ...original }, { ...original, x: 5000 }],
            ...(!scenario.manual ? { brainCalls: [
                { tool, arguments: { ...original } },
                { tool, arguments: { ...original, x: 5000 } }
            ] } : {})
        };
        const requests = [];
        const context = vm.createContext({
            URL, state, signal: { aborted: false },
            cur: { type: 'mcp', el: { querySelector: selector => ({
                '.url': { value: 'https://mcp.test' }, '.tool': { value: tool },
                '.args': { value: JSON.stringify(args) }, '.status': {}
            })[selector] } },
            ensureToken: async () => 'test',
            lowerKeys: row => row,
            callMcpTool: async (_url, _tool, payload) => { requests.push(payload); return {}; },
            console: { error() {} }
        });
        const run = () => vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
        if (scenario.error) {
            await assert.rejects(run(), /must be finite numbers/);
            assert.equal(requests.length, 0);
        } else {
            await run();
            assert.equal(requests.length, 2);
            assert.equal(requests[0].x, scenario.expected);
            assert.equal(requests[1].x, scenario.manual || scenario.templated ? scenario.expected : scenario.expected + 4000);
            if (!scenario.manual && !scenario.templated) {
                assert.equal(requests[0].y, original.y);
                assert.equal(requests[0].profile, original.profile);
                assert.equal(state.brainCalls[0].arguments.x, 1000);
            }
        }
    }
});

test('Call MCP adjusts all coordinate fields and replaces nonblank settings, including nested point coordinates', async () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('      if (cur.type === "mcp") {');
    const end = page.indexOf('      if (cur.type === "api") {', start);
    for (const tool of ['tekla_create_column', 'tekla_create_beam', 'tekla_create_polybeam', 'tekla_create_wall', 'tekla_create_slab']) {
        const original = {
            x: 1000, y: 2000, z: 3000, x1: 100, x2: 200, y1: 300, y2: 400, z1: 500, z2: 600,
            x3: 700, z4: 800, profile: '300*600', material: 'C30/37', classNumber: '1',
            height: 3000, enabled: true, labels: ['A', 'B'],
            points: [{ x: 100, y: 200, z: 300 }, { x: 400, y: 500, z: 600 }],
            origin: { x: 10, y: 20, z: 30 }
        };
        const inputs = {
            x: -300, y: 25, z: 0, x1: -10, x2: 10, y1: -20, y2: 20, z1: -30, z2: 30,
            x3: 50, z4: -50, profile: '400*700', material: ' ', classNumber: '0',
            height: 0, enabled: false, labels: ['C'],
            points: [{ x: -10, z: 50 }, { y: 25 }],
            origin: { z: -30 }
        };
        const requests = [];
        const state = { rows: [original], brainCalls: [{ tool, arguments: original }] };
        const context = vm.createContext({
            URL, state, signal: { aborted: false },
            cur: { type: 'mcp', el: { querySelector: selector => ({
                '.url': { value: 'https://mcp.test' }, '.tool': { value: tool },
                '.args': { value: JSON.stringify(inputs) }, '.status': {}
            })[selector] } },
            ensureToken: async () => 'test', lowerKeys: row => row,
            callMcpTool: async (_url, _tool, payload) => { requests.push(payload); return {}; }, console
        });
        await vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
        assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
            ...original, x: 700, y: 2025, z: 3000, x1: 90, x2: 210, y1: 280, y2: 420, z1: 470, z2: 630,
            x3: 750, z4: 750, profile: '400*700', classNumber: '0', height: 0, enabled: false,
            labels: ['C'], points: [{ x: 90, y: 200, z: 350 }, { x: 400, y: 525, z: 600 }],
            origin: { x: 10, y: 20, z: 0 }
        });
        assert.equal(original.points[0].x, 100);
        assert.equal(original.origin.z, 30);
    }
});

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

test('builds a parent grid from labeled fragments and reports unsupported entities', () => {
    const result = brainToTekla(dxfTextToRecords(rectangularDxf), ['gridline']);
    assert.deepEqual(result.grid, {
        origin: { x: 0, y: 0, z: 0 },
        coordinateX: ['0', '1000'], coordinateY: ['0', '100'],
        labelX: ['A', 'B'], labelY: ['1', '2'],
        extensionLeft: 10, extensionRight: 10, extensionBelow: 10, extensionAbove: 10
    });
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].tool, 'tekla_create_grid');
    assert.deepEqual(result.calls[0].arguments, result.grid);
    for (const [handle, reason] of [['dup', /duplicate/], ['curve', /curved/], ['diagonal', /diagonal/]]) {
        assert.match(result.skipped.find(item => item.handle === handle).reason, reason);
    }
    assert.match(result.gridWarnings[0], /rectangular extents/);
});

test('rejects ambiguous labels and disconnected fragments rather than guessing', () => {
    const records = dxfTextToRecords(rectangularDxf);
    records.find(record => record.Handle === 'b').Text = 'A';
    const result = brainToTekla(records, ['gridline']);
    assert.equal(result.grid, null);
    assert.equal(result.calls.length, 0);
    assert.match(result.skipped.find(item => item.handle === 'x2').reason, /multiple lines/);

    const disconnected = dxfTextToRecords(rectangularDxf);
    disconnected.find(record => record.Handle === 'x1b').Start_Y = 60;
    disconnected.find(record => record.Handle === 'dup').Start_Y = 60;
    const separated = brainToTekla(disconnected, ['gridline']);
    assert.match(separated.skipped.find(item => item.handle === 'x1a').reason, /disconnected/);
    assert.deepEqual(separated.grid.labelX, ['B']);
});

test('grid response distinguishes a returned GUID, failed response, and an unverified result', () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('function summarizeGridResponse(');
    const end = page.indexOf('async function runLoop(', start);
    const context = vm.createContext({});
    vm.runInContext(page.slice(start, end), context);
    const response = value => ({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } });
    const summarize = value => context.summarizeGridResponse(response(value), { labelX: ['A'] }, [], []);
    assert.equal(summarize({ guid: '12345678-1234-1234-1234-123456789abc' }).status, 'guid-returned');
    assert.equal(summarize({ success: false, error: 'insert failed' }).status, 'failed');
    assert.equal(summarize({ success: true }).status, 'unverified');
    assert.equal(summarize({ modelGuid: '12345678-1234-1234-1234-123456789abc' }).status, 'unverified');
});

test('automatic workflow dispatch sends the generated grid and retains verification details', async () => {
    const converted = brainToTekla(dxfTextToRecords(rectangularDxf), ['gridline']);
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('      if (cur.type === "mcp") {');
    const end = page.indexOf('      if (cur.type === "api") {', start);
    const summaryStart = page.indexOf('function summarizeGridResponse(');
    const summaryEnd = page.indexOf('async function runLoop(', summaryStart);
    const state = {
        rows: [...converted.calls.map(call => call.arguments), ...converted.gridlines],
        brainCalls: converted.calls,
        brainGridSkipped: converted.skipped.filter(item => item.type === 'gridline'),
        brainGridWarnings: converted.gridWarnings
    };
    const status = {};
    const requests = [];
    const context = vm.createContext({
        URL, state, signal: { aborted: false },
        cur: { type: 'mcp', el: { querySelector: selector => ({
            '.url': { value: 'https://mcp.test' }, '.tool': { value: '' },
            '.args': { value: '{}' }, '.status': status
        })[selector] } },
        ensureToken: async () => 'test',
        lowerKeys: row => row,
        callMcpTool: async (_url, tool, args) => {
            requests.push({ tool, args });
            return { result: { content: [{ type: 'text', text: '{"guid":"12345678-1234-1234-1234-123456789abc"}' }] } };
        },
        console
    });
    vm.runInContext(page.slice(summaryStart, summaryEnd), context);
    await vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].tool, 'tekla_create_grid');
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0].args)), converted.grid);
    assert.equal(state.result.gridVerification.status, 'guid-returned');
    assert.equal(state.result.gridVerification.skipped.length, state.brainGridSkipped.length);
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
