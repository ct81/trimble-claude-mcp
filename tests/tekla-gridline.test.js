import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { tools } from '../src/mcp/tekla/mcp-tools.js';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const operations = [
    { action: 'create', method: 'teklaCreateGridline', args: { parentGuid: 'parent-grid', label: 'A', isMagnetic: true, extensionLeft: 100 } },
    { action: 'update', method: 'teklaUpdateGridline', args: { guid: 'gridline', label: 'B', extensionAbove: 200 } },
    { action: 'delete', method: 'teklaDeleteGridline', args: { guid: 'gridline' } }
];

test('bridge sends gridline requests to the matching Tekla endpoints', async () => {
    const source = readSource('../src/mcp/tekla/bridge.js')
        .replace('import { getSelectedBridge } from "../bridge-selection.js";', '')
        .replaceAll('export const ', 'var ');
    let request;
    const logs = [];
    const context = vm.createContext({
        console: { log: (...args) => logs.push(args) },
        process: { env: { TEKLA_BRIDGE_KEY: 'test-key', TEKLA_BRIDGE_URL: 'http://tekla.test' } },
        getSelectedBridge: () => null,
        fetch: async (url, options) => {
            request = { url, options };
            return { ok: true, text: async () => '{"success":true}' };
        }
    });
    vm.runInContext(source, context);
    for (const { action, method, args } of operations) {
        const result = await context[method](args);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true });
        assert.equal(request.url, `http://tekla.test/api/tekla/${action}/gridline`);
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.headers['X-Tekla-Bridge-Key'], 'test-key');
        assert.deepEqual(JSON.parse(request.options.body), args);
        const [requestLog, responseLog] = logs.splice(0);
        assert.equal(requestLog[0], `[Tekla] tekla_${action}_gridline request:`);
        assert.deepEqual(requestLog[1].arguments, args);
        assert.equal(responseLog[0], `[Tekla] tekla_${action}_gridline response:`);
        assert.ok(responseLog[1].durationMs >= 0);
        assert.equal(responseLog[1].result.success, true);
        assert.equal(JSON.stringify([requestLog, responseLog]).includes('test-key'), false);
    }
});

test('gridline failures are logged and still reject for all operations', async () => {
    const source = readSource('../src/mcp/tekla/bridge.js')
        .replace('import { getSelectedBridge } from "../bridge-selection.js";', '')
        .replaceAll('export const ', 'var ');
    for (const { action, method, args } of operations) {
        for (const failure of ['network', 'http', 'json', 'config']) {
            const errors = [];
            const networkError = new Error('Connection refused');
            const context = vm.createContext({
                process: { env: { TEKLA_BRIDGE_KEY: 'test-key', TEKLA_BRIDGE_URL: failure === 'config' ? '' : 'http://tekla.test' } },
                getSelectedBridge: () => null,
                console: { log() {}, error: (...args) => errors.push(args) },
                fetch: async () => {
                    if (failure === 'network') throw networkError;
                    return { ok: false, status: 400, text: async () => failure === 'json' ? 'invalid JSON' : '{"error":"Invalid grid"}' };
                }
            });
            vm.runInContext(source, context);
            await assert.rejects(context[method](args), error => {
                if (failure === 'network') assert.equal(error, networkError);
                assert.equal(errors.length, 1);
                assert.equal(errors[0][0], `[Tekla] tekla_${action}_gridline failed:`);
                assert.equal(errors[0][1].error, error.message);
                assert.ok(errors[0][1].durationMs >= 0);
                return true;
            });
        }
    }
});

test('main MCP dispatcher forwards gridline operations and bridge failures', async () => {
    const source = readSource('../src/mcp/tools.js');
    const start = source.indexOf('async function callToolInBridgeSession(');
    const end = source.indexOf('export function callTool(', start);
    assert.ok(start >= 0 && end > start);
    let forwarded;
    let bridgeError;
    const context = vm.createContext({
        getToolBridgePlatform: () => 'Tekla',
        authorizeBridge: () => {},
        sketchupInspectionDefinitions: [],
        SKETCHUP_PREFIX: 'sketchup_',
        teklaBridge: Object.fromEntries(operations.map(({ method }) => [method, async args => {
            if (bridgeError) throw bridgeError;
            forwarded = { method, args };
            return { success: true };
        }]))
    });
    vm.runInContext(source.slice(start, end), context);
    for (const { action, method, args } of operations) {
        const result = await context.callToolInBridgeSession('test-session', `tekla_${action}_gridline`, args);
        assert.deepEqual(forwarded, { method, args });
        assert.deepEqual(JSON.parse(result.content[0].text), { success: true });
    }
    bridgeError = new Error('Tekla bridge unavailable');
    await assert.rejects(context.callToolInBridgeSession('test-session', 'tekla_create_gridline', operations[0].args), bridgeError);
});

test('server registers authenticated POST routes for all gridline operations', async () => {
    const source = readSource('../src/server.js');
    const start = source.indexOf('const teklaActionRoutes = [');
    const end = source.indexOf('// GREEN-API webhook:', start);
    assert.ok(start >= 0 && end > start);
    const routes = new Map();
    const requireSession = () => {};
    let forwarded;
    const context = vm.createContext({
        app: {
            post: (path, auth, handler) => routes.set(path, { auth, handler }),
            get: () => {}
        },
        requireSession,
        executeTeklaTool: (_req, _res, name, args) => { forwarded = { name, args }; }
    });
    vm.runInContext(source.slice(start, end), context);
    for (const { action, args } of operations) {
        const route = routes.get(`/api/mcp/tekla/${action}/gridline`);
        assert.ok(route);
        assert.equal(route.auth, requireSession);
        for (const body of [args, { arguments: args }]) {
            await route.handler({ body }, {});
            assert.deepEqual(forwarded, { name: `tekla_${action}_gridline`, args });
        }
    }
});

test('Swagger documents gridline REST and MCP routes using the bridge schemas', async () => {
    const source = readSource('../src/swagger/swagger.js')
        .replace("import { definitions, getDefinitions } from '../mcp/tools.js';", '')
        .replaceAll('export ', '');
    const context = vm.createContext({
        definitions: tools,
        getDefinitions: async () => tools,
        structuredClone,
        process: { env: {} },
        console: { log() {} }
    });
    vm.runInContext(source, context);
    const doc = await context.getSwaggerDocument();
    for (const { action } of operations) {
        const name = `tekla_${action}_gridline`;
        const definition = tools.find(tool => tool.name === name);
        for (const path of [`/api/mcp/tekla/${action}/gridline`, `/api/mcp/tools/${name}`]) {
            const operation = doc.paths[path].post;
            assert.ok(operation);
            assert.deepEqual(JSON.parse(JSON.stringify(operation.security)), [{ bearerAuth: [] }]);
            assert.deepEqual(operation.requestBody.content['application/json'].schema, definition.inputSchema);
        }
    }
});
