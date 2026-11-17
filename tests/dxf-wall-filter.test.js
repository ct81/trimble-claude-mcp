import assert from 'node:assert/strict';
import test from 'node:test';
import { annotationSkipReason, filterWallCalls, wallCallRejection } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';
import { brainToTekla } from '../src/AI_RoachHarbor/brain-tekla.js';

const wallCall = (handle, x1, y1, x2, y2) => ({
    handle,
    type: 'wall',
    tool: 'tekla_create_wall',
    arguments: {
        x1, y1, z1: 0, x2, y2, z2: 0,
        x3: x2, y3: y2, z3: 3000, x4: x1, y4: y1, z4: 3000,
        profile: 'PL200', material: 'C30/37', classNumber: ''
    }
});

test('filterWallCalls passes genuine walls and removes everything else', () => {
    const walls = [
        wallCall('2E2', 8645.03526355962, 19709.3440434247, 8945.03526355962, 19709.3440434247),
        wallCall('2EC', 8795.03526355963, 23559.3440434247, 14795.0352635596, 23559.3440434247)
    ];
    const { calls, removed } = filterWallCalls({
        calls: [
            ...walls,
            wallCall('2E5', 8645.03526355962, 19709.3440434247, 8945.03526355962, 19709.3440434247),
            { handle: '196', type: 'beam', tool: 'tekla_create_beam', arguments: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0 } },
            { handle: 'BAD', type: 'wall', tool: 'tekla_create_wall', arguments: { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, x3: 0, y3: 0, z3: 3000 } }
        ]
    });
    assert.deepEqual(calls, walls);
    assert.deepEqual(removed.map((item) => [item.handle, item.reason]), [
        ['196', 'tool tekla_create_beam is not a wall'],
        ['BAD', 'wall base has zero length'],
        ['2E5', 'duplicate of an earlier object']
    ]);
});

test('wallCallRejection accepts a 3-point contour and flags bad corners', () => {
    assert.equal(wallCallRejection({
        tool: 'tekla_create_wall',
        arguments: { x1: 0, y1: 0, z1: 0, x2: 5000, y2: 0, z2: 0, x3: 5000, y3: 0, z3: 3000 }
    }), null);
    assert.match(String(wallCallRejection({
        tool: 'tekla_create_wall',
        arguments: { x1: 0, y1: 0, z1: 0, x2: 5000, y2: 'oops', z2: 0, x3: 5000, y3: 0, z3: 3000 }
    })), /y2 is not a number/);
});

test('annotation tag layers are flagged unless they are closed outlines', () => {
    assert.equal(annotationSkipReason({ Layer: 'S-_WALL----_T', Type: 'LINE' }), 'annotation layer S-_WALL----_T');
    assert.equal(annotationSkipReason({ Layer: 'S-_WALL----_T2', Type: 'LINE' }), 'annotation layer S-_WALL----_T2');
    assert.equal(annotationSkipReason({ Layer: 'S-_SLAB----_T', Type: 'POLYLINE', Closed: 'yes' }), null);
    assert.equal(annotationSkipReason({ Layer: 'S-_WALL----', Type: 'LINE' }), null);
});

test('filterWallCalls collapses outline edge chains into exactly one wall per handle', () => {
    // The 9 segment calls from the user's plan: each handle outlines ONE wall in plan.
    const seg = (handle, x1, y1, x2, y2) => ({
        handle, type: 'wall', tool: 'tekla_create_wall',
        arguments: {
            x1, y1, z1: 0, x2, y2, z2: 0, x3: x2, y3: y2, z3: 3000, x4: x1, y4: y1, z4: 3000,
            profile: 'PL200', material: 'C30/37', classNumber: ''
        }
    });
    const { calls, removed } = filterWallCalls([
        seg('2E2', 8645.03526355962, 19709.3440434247, 8945.03526355962, 19709.3440434247),
        seg('2E2', 8945.03526355962, 19709.3440434247, 8945.03526355963, 23859.3440434247),
        seg('2E2', 8945.03526355963, 23859.3440434247, 8645.03526355963, 23859.3440434247),
        seg('2E7', 14645.0352635596, 19709.3440434247, 14945.0352635596, 19709.3440434247),
        seg('2E7', 14945.0352635596, 19709.3440434247, 14945.0352635596, 23709.3440434247),
        seg('2E7', 14945.0352635596, 23709.3440434247, 14645.0352635596, 23709.3440434247),
        seg('2EC', 8795.03526355963, 23559.3440434247, 14795.0352635596, 23559.3440434247),
        seg('2EC', 14795.0352635596, 23559.3440434247, 14795.0352635596, 23859.3440434247),
        seg('2EC', 14795.0352635596, 23859.3440434247, 8795.03526355963, 23859.3440434247)
    ]);
    assert.equal(removed.length, 0);
    assert.deepEqual(calls.map((call) => call.handle), ['2E2', '2E7', '2EC']);
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} !~ ${expected}`);
    const centrelines = [
        [8795.0352635596, 19709.3440434247, 8795.0352635596, 23859.3440434247],
        [14795.0352635596, 19709.3440434247, 14795.0352635596, 23709.3440434247],
        [8795.0352635596, 23709.3440434247, 14795.0352635596, 23709.3440434247]
    ];
    calls.forEach((call, index) => {
        const [x1, y1, x2, y2] = centrelines[index];
        near(call.arguments.x1, x1); near(call.arguments.y1, y1);
        near(call.arguments.x2, x2); near(call.arguments.y2, y2);
        assert.deepEqual(
            [call.arguments.z1, call.arguments.z2, call.arguments.z3, call.arguments.z4],
            [0, 0, 3000, 3000]
        );
        assert.equal(call.arguments.profile, 'PL200');
        assert.equal(wallCallRejection(call), null);
    });
});

test('brainToTekla maps an open thin-rectangle outline to one centreline wall', () => {
    const result = brainToTekla([{
        Handle: '2E2', Type: 'POLYLINE', Layer: 'S-_WALL----', Closed: 'no',
        Vertices: '(8645,19709); (8945,19709); (8945,23859); (8645,23859)'
    }], ['wall']);
    assert.equal(result.calls.length, 1);
    const { arguments: args } = result.calls[0];
    assert.deepEqual(
        [args.x1, args.y1, args.x2, args.y2, args.z3, args.z4],
        [8795, 19709, 8795, 23859, 3000, 3000]
    );
});

test('brainToTekla passes rectangular walls and skips annotation layers and duplicates', () => {
    const line = (Handle, Layer) => ({
        Handle, Layer, Type: 'LINE',
        Start_X: 8645.03526355962, Start_Y: 19709.3440434247,
        End_X: 8945.03526355962, End_Y: 19709.3440434247
    });
    const result = brainToTekla(
        [line('2E2', 'S-_WALL----'), line('2E3', 'S-_WALL----_T'), line('2E5', 'S-_WALL----')],
        ['wall']
    );
    assert.equal(result.calls.length, 1);
    const call = result.calls[0];
    assert.equal(call.tool, 'tekla_create_wall');
    assert.equal(wallCallRejection(call), null);
    assert.deepEqual(
        [call.arguments.z3, call.arguments.z4, call.arguments.x4, call.arguments.y4],
        [3000, 3000, call.arguments.x1, call.arguments.y1]
    );
    assert.deepEqual(result.skipped.map((item) => [item.handle, item.reason]), [
        ['2E3', 'annotation layer S-_WALL----_T'],
        ['2E5', 'duplicate of an earlier object']
    ]);
});
