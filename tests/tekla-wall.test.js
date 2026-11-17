import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

function loadBridge(onFetch) {
    const source = readSource('../src/mcp/tekla/bridge.js')
        .replace('import { getSelectedBridge } from "../bridge-selection.js";', '')
        .replaceAll('export const ', 'var ')
        .replaceAll('export function ', 'function ');
    const context = vm.createContext({
        process: { env: { TEKLA_BRIDGE_KEY: 'test-key', TEKLA_BRIDGE_URL: 'http://tekla.test' } },
        getSelectedBridge: () => null,
        fetch: onFetch
    });
    vm.runInContext(source, context);
    return context;
}

test('wall creation completes the 4th rectangle corner when omitted', async () => {
    let request;
    const bridge = loadBridge(async (url, options) => {
        request = { url, options };
        return { ok: true, text: async () => '{"success":true}' };
    });
    await bridge.teklaCreateWall({
        x1: 0, y1: 0, z1: 0,
        x2: 5000, y2: 0, z2: 0,
        x3: 5000, y3: 0, z3: 3000,
        profile: 'PL200', material: 'C30/37'
    });
    assert.equal(request.url, 'http://tekla.test/api/tekla/create/wall');
    const body = JSON.parse(request.options.body);
    assert.deepEqual(
        { x4: body.x4, y4: body.y4, z4: body.z4 },
        { x4: 0, y4: 0, z4: 3000 }
    );
    assert.equal(body.profile, 'PL200');
});

test('wall creation keeps explicit 4th corners and triangle walls untouched', async () => {
    let request;
    const bridge = loadBridge(async (url, options) => {
        request = { url, options };
        return { ok: true, text: async () => '{"success":true}' };
    });
    const explicit = {
        x1: 0, y1: 0, z1: 0, x2: 1000, y2: 0, z2: 0,
        x3: 1000, y3: 0, z3: 2000, x4: 10, y4: 20, z4: 2500
    };
    await bridge.teklaCreateWall(explicit);
    assert.deepEqual(JSON.parse(request.options.body), explicit);

    const triangle = {
        x1: 0, y1: 0, z1: 0, x2: 1000, y2: 0, z2: 0,
        x3: 500, y3: 0, z3: 2000, shape: 'triangle'
    };
    await bridge.teklaCreateWall(triangle);
    const body = JSON.parse(request.options.body);
    assert.equal(body.x4, undefined);
    assert.equal(body.shape, undefined);
});
