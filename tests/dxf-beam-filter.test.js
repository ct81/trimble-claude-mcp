import assert from 'node:assert/strict';
import test from 'node:test';
import { beamCallRejection, filterBeamCalls } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';
import { brainToTekla } from '../src/AI_RoachHarbor/brain-tekla.js';

const beam = (handle, overrides = {}) => ({
    handle, type: 'beam', tool: 'tekla_create_beam',
    arguments: {
        x1: 14645.0352635596, y1: 23859.3440434247, z1: 0,
        x2: 14645.0352635596, y2: 27384.3440434247, z2: 0,
        profile: '', material: 'C30/37', classNumber: '',
        ...overrides
    }
});

test('filterBeamCalls preserves supplied straight beams and removes non-beams, invalid paths and duplicates', () => {
    const straight = beam('19A');
    const other = beam('19B', { x1: 14945.0352635596, x2: 14945.0352635596 });
    const curved = {
        handle: '2C6', type: 'beam', tool: 'tekla_create_polybeam',
        arguments: { points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 20, y: 0, z: 0 }] }
    };
    const result = filterBeamCalls({
        calls: [
            straight, other, curved,
            { ...straight, handle: '100', type: 'column', tool: 'tekla_create_column' },
            { ...straight, handle: '2E2', type: 'wall' },
            beam('196', { y2: straight.arguments.y1 }),
            beam('BAD', { x2: null }),
            beam('COPY')
        ]
    });
    assert.deepEqual(result.calls, [straight, other, curved]);
    assert.deepEqual(result.removed.map(({ handle }) => handle), ['100', '2E2', '196', 'BAD', 'COPY']);
    assert.match(result.removed[0].reason, /not a beam/);
    assert.match(result.removed.at(-1).reason, /duplicate/);
});

test('beamCallRejection rejects invalid polybeam segments and coordinates', () => {
    const polybeam = (points) => ({ tool: 'tekla_create_polybeam', arguments: { points } });
    const p = { x: 0, y: 0, z: 0 };
    assert.match(beamCallRejection(polybeam([p])), /at least 2/);
    assert.match(beamCallRejection(polybeam([p, { ...p }])), /zero-length/);
    for (const x of [undefined, null, '', ' ', Infinity, 'oops']) {
        assert.match(beamCallRejection(polybeam([p, { x, y: 1, z: 0 }])), /finite numbers/);
    }
});

test('brainToTekla keeps straight beam coordinates and skips non-beams and annotation graphics', () => {
    const source = {
        Handle: '19A', Type: 'LINE', Layer: 'S-_BEAM----',
        Start_X: 14645.0352635596, Start_Y: 23859.3440434247,
        End_X: 14645.0352635596, End_Y: 27384.3440434247
    };
    const result = brainToTekla([
        source,
        { ...source, Handle: '19C', Layer: 'S-_BEAM----_T' },
        { ...source, Handle: '19D', Layer: 'S-_BEAM----_T2' },
        { ...source, Handle: '100', Layer: 'S-_COLN----' },
        { ...source, Handle: 'TEXT', Type: 'TEXT' },
        { ...source, Handle: '196', End_Y: source.Start_Y }
    ], ['beam'], { beam: { profile: '' } });
    assert.deepEqual(result.calls, [{ ...beam('19A'), profileFrom: 'default' }]);
    assert.equal(result.skipped.length, 5);
    assert.match(result.skipped.find(({ handle }) => handle === 'TEXT').reason, /not a beam path/);
});

test('multi-point beam uses its entire contour even when endpoints are present or coincident', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }];
    for (const End_X of [0, 200]) {
        const result = brainToTekla([{
            Handle: 'CURVE', Type: 'POLYLINE', Layer: 'S-_BEAM----',
            Start_X: 0, Start_Y: 0, End_X, End_Y: 0, Vertices: vertices
        }], ['beam'], { beam: { profile: '300x600', height: 4500 } });
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0].tool, 'tekla_create_polybeam');
        assert.deepEqual(result.calls[0].arguments.points, vertices.map((p) => ({ ...p, z: 4500 })));
        assert.equal(result.calls[0].arguments.profile, '300x600');
    }
});

test('ARC beam becomes one polybeam with wraparound, elevation and at most 1 mm chord deviation', () => {
    const result = brainToTekla([{
        Handle: '2C6', Type: 'ARC', Layer: 'S-_BEAM----',
        Center_X: 100, Center_Y: 200, Center_Z: 2500,
        Radius: 30000, StartAngle: 350, EndAngle: 80
    }], ['beam'], { beam: { profile: '300*600', height: 4500 } });
    assert.equal(result.skipped.length, 0);
    assert.deepEqual(result.mapped, { tekla_create_polybeam: 1 });
    const call = result.calls[0];
    assert.equal(call.arguments.profile, '300*600');
    assert.equal(call.profileFrom, 'default');
    const points = call.arguments.points;
    for (const [index, degrees] of [[0, 350], [points.length - 1, 80]]) {
        assert.ok(Math.abs(points[index].x - (100 + 30000 * Math.cos(degrees * Math.PI / 180))) < 1e-8);
        assert.ok(Math.abs(points[index].y - (200 + 30000 * Math.sin(degrees * Math.PI / 180))) < 1e-8);
    }
    points.forEach((p, index) => {
        assert.equal(p.z, 2500);
        assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 200) - 30000) < 1e-8);
        if (index) {
            const previous = points[index - 1];
            const midpointRadius = Math.hypot((p.x + previous.x) / 2 - 100, (p.y + previous.y) / 2 - 200);
            assert.ok(30000 - midpointRadius <= 1 + 1e-8);
        }
    });
});

test('incomplete and zero-sweep arcs are skipped explicitly rather than made into straight beams', () => {
    const arc = {
        Type: 'ARC', Layer: 'S-_BEAM----', Center_X: 0, Center_Y: 0,
        Radius: 1000, StartAngle: 0, EndAngle: 90,
        Start_X: 0, Start_Y: 0, End_X: 1000, End_Y: 1000
    };
    const result = brainToTekla([
        { ...arc, Handle: 'MISSING', EndAngle: '' },
        { ...arc, Handle: 'ZERO', EndAngle: 0 },
        { ...arc, Handle: 'RADIUS', Radius: -1 }
    ], ['beam']);
    assert.equal(result.calls.length, 0);
    assert.equal(result.skipped.length, 3);
    assert.match(result.skipped[0].reason, /needs center/);
    assert.match(result.skipped[1].reason, /zero angular sweep/);
    assert.match(result.skipped[2].reason, /positive radius/);
});
