import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { brainToTekla } from '../src/AI_RoachHarbor/brain-tekla.js';
import { dxfTextToRecords } from '../src/AI_RoachHarbor/dxf-text.js';
import { convertDxfJson, triangulateSlabPanel } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';

const area = points => Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
}, 0)) / 2;
const line = (handle, x1, y1, x2, y2) => ({
    Handle: handle, Type: 'LINE', Layer: 'S-_BEAM----_E',
    Start_X: x1, Start_Y: y1, End_X: x2, End_Y: y2
});
const rectangle = [
    line('A', 0, 0, 1000, 0), line('B', 1000, 0, 1000, 1000),
    line('C', 1000, 1000, 0, 1000), line('D', 0, 1000, 0, 0)
];

test('slabs use LWPOLYLINE vertices instead of surrounding beams, arrows or text boxes', () => {
    const result = brainToTekla([
        ...rectangle,
        { Handle: 'SLAB', Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_E', Closed: 'Yes',
            Vertices: [{ x: 2000, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1000 }, { x: 2000, y: 1000 }] },
        { Handle: 'ARROW', Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_E',
            Vertices: [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 100 }] },
        { Handle: 'BOX', Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_T', Closed: 'Yes',
            Vertices: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }] },
        { Type: 'MTEXT', Layer: 'S-_SLAB----_T', Text: 'SI 1\\P250 mm', Start_X: 500, Start_Y: 500 }
    ], ['slab'], { slab: { height: '4500', profile: '' } });
    assert.equal(result.slabPanels, 1);
    assert.equal(result.calls.length, 2);
    let total = 0;
    for (const call of result.calls) {
        assert.equal(call.handle, 'SLAB');
        assert.equal(call.arguments.profile, 'PL250');
        const a = call.arguments;
        const points = [1, 2, 3].map(i => ({ x: a[`x${i}`], y: a[`y${i}`], z: a[`z${i}`] }));
        assert.ok(points.every(p => p.z === 4500));
        assert.ok(points.every(p => p.x >= 2000 && p.x <= 3000));
        total += area(points);
    }
    assert.equal(total, 1000000);
    assert.ok(result.skipped.some(item => item.handle === 'ARROW'));
    assert.ok(result.skipped.some(item => item.handle === 'BOX'));
});

test('beam-only networks do not generate slabs', () => {
    const split = brainToTekla([...rectangle, line('DIVIDER', 500, 0, 500, 1000)], ['slab']);
    assert.equal(split.slabPanels, 0);
    assert.equal(split.calls.length, 0);
    const open = brainToTekla(rectangle.slice(0, 3), ['slab']);
    assert.equal(open.calls.length, 0);
});

test('concave slab outlines retain their entire area through triangulation', () => {
    const vertices = [[0, 0], [1000, 0], [1000, 500], [500, 500], [500, 1000], [0, 1000]]
        .map(([x, y]) => ({ x, y, z: 0 }));
    const triangles = triangulateSlabPanel(vertices);
    assert.equal(triangles.length, 4);
    assert.equal(triangles.reduce((sum, triangle) => sum + area(triangle), 0), 750000);
    const explicit = brainToTekla([{
        Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_E', Closed: 'Yes', Vertices: [...vertices].reverse()
    }], ['slab']);
    assert.equal(explicit.calls.length, 4);
    assert.throws(() => triangulateSlabPanel([
        { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }
    ]), /zero area/);
});

test('slabs reject other entity types even with closed polygon vertices', () => {
    const records = ['LINE', 'ARC', 'POLYLINE', 'CIRCLE', 'TEXT', 'MTEXT'].map(Type => ({
        Handle: Type, Type, TeklaPartType: 'Slab', Layer: 'S-_SLAB----_E', Closed: true,
        Vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]
    }));
    assert.equal(convertDxfJson(records).calls.length, 0);
    const result = brainToTekla(records, ['slab']);
    assert.equal(result.calls.length, 0);
    assert.equal(result.skipped.length, records.length);
    assert.ok(result.skipped.every(item => /only LWPOLYLINE/.test(item.reason)));
});

test('closed LWPOLYLINE aliases and wrapped JSON retain source elevation and entered settings', () => {
    const records = [{
        handle: 'UPPER', type: 'lwpolyline', layer: 'S-_SLAB----_E', closed: true,
        vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }],
        Elevation_mm: 3000
    }];
    const result = brainToTekla(JSON.stringify({ entities: records }), ['slab'],
        { slab: { profile: 'PL225', material: 'C40/50', classNumber: '6' } });
    assert.equal(result.slabPanels, 1);
    assert.equal(result.calls.length, 2);
    for (const { arguments: args } of result.calls) {
        assert.deepEqual([args.z1, args.z2, args.z3], [3000, 3000, 3000]);
        assert.equal(args.profile, 'PL225');
        assert.equal(args.material, 'C40/50');
        assert.equal(args.classNumber, '6');
    }
});

test('DXF closed bit and repeated endpoints both identify LWPOLYLINE outlines', () => {
    const records = dxfTextToRecords([
        '0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '5', 'CLOSED', '8', 'S-_SLAB----_E',
        '70', '129', '38', '2000', '10', '0', '20', '0', '10', '1000', '20', '0',
        '10', '1000', '20', '1000', '10', '0', '20', '1000',
        '0', 'ENDSEC', '0', 'EOF'
    ].join('\n'));
    assert.equal(records[0].Closed, true);
    const closed = brainToTekla(records, ['slab']);
    assert.equal(closed.slabPanels, 1);
    assert.equal(closed.calls.length, 2);
    assert.ok(closed.calls.every(call => call.arguments.z1 === 2000));
    const repeated = { ...records[0], Closed: false,
        Vertices: [...records[0].Vertices, records[0].Vertices[0]] };
    assert.equal(brainToTekla([repeated], ['slab']).calls.length, 2);
    assert.equal(brainToTekla([{ ...records[0], Closed: false }], ['slab']).calls.length, 0);
});

test('slab arrows and closed annotation boxes are skipped without a supporting network', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const result = brainToTekla([
        { Handle: 'ARROW', Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_E', Vertices: vertices },
        { Handle: 'BOX', Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_T', Closed: 'Yes', Vertices: vertices }
    ], ['slab']);
    assert.equal(result.calls.length, 0);
    assert.equal(result.skipped.length, 2);
    assert.ok(result.skipped.every(item => /not arrows or label boxes/.test(item.reason)));
});

test('actual drawing does not turn open slab polylines or tag boxes into slab panels', () => {
    const records = dxfTextToRecords(readFileSync(
        new URL('../images/upload/TSD1 St. 3 (3) General Arrangement.dxf', import.meta.url), 'utf8'
    ));
    const result = brainToTekla(records, ['slab'], { slab: { height: 4000, profile: 'PL225' } });
    assert.equal(result.calls.length, 0);
    assert.equal(result.slabPanels, 0);
    for (const record of records.filter(record => /slab/i.test(record.Layer))) {
        assert.ok(result.skipped.some(item => item.handle === record.Handle));
    }
});
