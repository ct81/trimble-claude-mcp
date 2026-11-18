import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { brainToTekla } from '../src/AI_RoachHarbor/brain-tekla.js';
import { dxfTextToRecords } from '../src/AI_RoachHarbor/dxf-text.js';
import { convertDxfJson, deriveSlabPanels, mergeBeamBoundaries, triangulateSlabPanel } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';

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

test('slab derivation uses beam boundaries, not slab arrows or text boxes', () => {
    const result = brainToTekla([
        ...rectangle,
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
        assert.match(call.handle, /^SLAB-PANEL-/);
        assert.equal(call.arguments.profile, 'PL250');
        const a = call.arguments;
        const points = [1, 2, 3].map(i => ({ x: a[`x${i}`], y: a[`y${i}`], z: a[`z${i}`] }));
        assert.ok(points.every(p => p.z === 4500));
        total += area(points);
    }
    assert.equal(total, 1000000);
    assert.ok(result.skipped.some(item => item.handle === 'ARROW'));
    assert.ok(result.skipped.some(item => item.handle === 'BOX'));
});

test('slab faces split at crossing beams, but gaps and different elevations are not invented', () => {
    const split = brainToTekla([...rectangle, line('DIVIDER', 500, 0, 500, 1000)], ['slab']);
    assert.equal(split.slabPanels, 2);
    assert.equal(split.calls.length, 4);
    const open = brainToTekla(rectangle.slice(0, 3), ['slab']);
    assert.equal(open.calls.length, 0);
    assert.ok(open.skipped.some(item => /no closed slab/.test(item.reason)));
    const elevated = brainToTekla(rectangle.map((record, i) =>
        i === 3 ? { ...record, Elevation_mm: 1000 } : record), ['slab']);
    assert.equal(elevated.calls.length, 0);
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

test('collinear spans bridge support-sized gaps, but not larger openings', () => {
    const withGap = gap => [
        ...rectangle.filter(record => record.Handle !== 'C'),
        line('TOP_LEFT', 0, 1000, 500 - gap / 2, 1000),
        line('TOP_RIGHT', 500 + gap / 2, 1000, 1000, 1000),
        { Type: 'CIRCLE', Layer: 'S-_COLN----_E', Center_X: 500, Center_Y: 1000, Radius: 325 }
    ];
    assert.equal(brainToTekla(withGap(650), ['slab']).slabPanels, 1);
    const open = brainToTekla(withGap(900), ['slab']);
    assert.equal(open.slabPanels, 0);
    assert.ok(open.skipped.some(item => /no closed slab/.test(item.reason)));
});

test('slab labels remain on their own floor and wrapped JSON inputs remain supported', () => {
    const upper = rectangle.map(record => ({ ...record, Handle: `${record.Handle}2`, Elevation_mm: 3000 }));
    const records = [...rectangle, ...upper, {
        Type: 'MTEXT', Layer: 'S-_SLAB----_T', Text: 'SI 1\\P200 mm',
        Start_X: 500, Start_Y: 500, Elevation_mm: 3000
    }];
    const result = brainToTekla(JSON.stringify({ entities: records }), ['slab']);
    assert.equal(result.slabPanels, 1);
    assert.ok(result.calls.every(call => call.arguments.z1 === 3000));
    assert.ok(!result.skipped.some(item => /not inside one closed/.test(item.reason)));
});

test('nested supporting loops are reported, not filled across a potential opening', () => {
    const inner = rectangle.map(record => ({
        ...record, Handle: `${record.Handle}INNER`,
        Start_X: 300 + record.Start_X * 0.4, Start_Y: 300 + record.Start_Y * 0.4,
        End_X: 300 + record.End_X * 0.4, End_Y: 300 + record.End_Y * 0.4
    }));
    const result = brainToTekla([...rectangle, ...inner], ['slab']);
    assert.equal(result.calls.length, 0);
    assert.ok(result.skipped.some(item => /holes are not supported/.test(item.reason)));
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

test('actual drawing produces 21 labeled slab regions and preserves their area, curve and level', () => {
    const records = dxfTextToRecords(readFileSync(
        new URL('../images/upload/TSD1 St. 3 (3) General Arrangement.dxf', import.meta.url), 'utf8'
    ));
    const converted = convertDxfJson(records);
    const beams = mergeBeamBoundaries(converted.calls, converted.profilesByType);
    const { panels, skipped } = deriveSlabPanels(beams.calls, records, 4000);
    assert.equal(panels.length, 21);
    assert.deepEqual(skipped, []);
    assert.ok(panels.some(panel => panel.length > 10));
    const result = brainToTekla(records, ['slab'], { slab: { height: 4000, profile: 'PL225' } });
    assert.equal(result.slabPanels, 21);
    assert.ok(result.calls.every(call => call.handle.startsWith('SLAB-PANEL-')));
    assert.ok(!result.skipped.some(item => /triangulated|not inside one closed/.test(item.reason)));
    const panelArea = panels.reduce((sum, panel) => sum + area(panel), 0);
    const modeledArea = result.calls.reduce((sum, call) => {
        const a = call.arguments;
        assert.equal(a.profile, 'PL225');
        assert.deepEqual([a.z1, a.z2, a.z3], [4000, 4000, 4000]);
        return sum + area([1, 2, 3].map(i => ({ x: a[`x${i}`], y: a[`y${i}`] })));
    }, 0);
    assert.ok(Math.abs(modeledArea - panelArea) < 0.01);
    assert.ok(panelArea > 400000000 && panelArea < 460000000);
});
