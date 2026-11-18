import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beamCallRejection, convertDxfJson, dimensionedBeam, extractBeamProfiles, extractProfilesByType, filterBeamCalls } from '../src/AI_RoachHarbor/supraesophageal_ganglion_4_dxf.js';
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

const beamRecord = {
    Handle: '19A', Type: 'LINE', Layer: 'S-_BEAM----_E1',
    Start_X: 0, Start_Y: 0, End_X: 0, End_Y: 3500
};
const sizeTag = (Text) => ({ Type: 'MTEXT', Layer: 'S-_BEAM----_T2', Text });

test('beam profile detection prefers beam size tags over contaminated exported profiles', () => {
    assert.deepEqual(extractBeamProfiles([
        { ...beamRecord, Profile: '650x650' },
        { ...beamRecord, Profile: '6000×300' },
        sizeTag('300x600'), sizeTag('300×600'),
        { ...sizeTag('650x650'), Layer: 'S-_COLN----_T2' },
        { ...sizeTag('6000×300'), Layer: 'S-_WALL----_T2' },
        { ...beamRecord, Layer: 'S-_SLAB----_E', Profile: '900x900' }
    ]), ['300*600']);
    assert.deepEqual(extractBeamProfiles([
        { ...beamRecord, Profile: '300x600' },
        { ...beamRecord, Profile: '900x900', End_Y: 0 }
    ]), ['300*600']);
    assert.deepEqual(extractBeamProfiles([beamRecord]), []);
    assert.deepEqual(extractBeamProfiles([sizeTag('300x600'), sizeTag('400x700')]), ['300*600', '400*700']);
});

test('a detected DXF section supplies blank beam defaults without a fixed fallback', () => {
    const records = [beamRecord, sizeTag('400x700')];
    const converted = brainToTekla(records, ['beam'], { beam: { profile: '' } });
    assert.equal(converted.calls[0].arguments.profile, '400*700');
    assert.equal(brainToTekla(records, ['beam'], { beam: { profile: '500*800' } }).calls[0].arguments.profile, '500*800');
    assert.equal(brainToTekla([...records, sizeTag('300x600')], ['beam'], { beam: { profile: '' } }).calls[0].arguments.profile, '');
});

test('Brain conversion populates the Beam textbox, preserves entered settings and exposes mixed sections', async () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('      if (cur.type === "brain") {');
    const end = page.indexOf('      if (cur.type === "mcp") {', start);
    for (const [entered, tags, expected] of [
        ['', [sizeTag('400x700')], '400*700'],
        ['500*800', [sizeTag('400x700')], '500*800'],
        ['', [], ''],
        ['', [sizeTag('400x700'), sizeTag('300x600')], '']
    ]) {
        const input = { value: entered };
        const state = { fileText: JSON.stringify([beamRecord, ...tags]) };
        const context = vm.createContext({
            state,
            cur: { type: 'brain', el: { querySelector: selector => selector === '[data-k="beam_profile"]' ? input : {} } },
            readFlow: () => ({ script: 'supraesophageal_ganglion_4_dxf.js', type_beam: true, beam_profile: entered }),
            ensureToken: async () => 'test',
            fetch: async (_url, options) => {
                const body = JSON.parse(options.body);
                return { ok: true, json: async () => brainToTekla(body.records, body.types, body.defaults) };
            },
            renderBrain() {}
        });
        await vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
        assert.equal(input.value, expected);
        assert.equal(state.brainDefaults.beam.profile, expected);
        if (tags.length > 1) assert.match(input.placeholder, /400\*700, 300\*600/);
        if (expected) assert.equal(state.brainCalls[0].arguments.profile, expected);
    }
});

test('per-type profiles use structural layers, aliases and size tags without cross-type contamination', () => {
    const profiles = extractProfilesByType([
        { ...beamRecord, Type: 'ARC', Layer: 'S-_POLYBEAM----_E', Profile: '250x500' },
        { ...beamRecord, Layer: 'S-_COLN----_E', TeklaPartType: 'Beam', Section: '650x650' },
        { ...sizeTag('650 Dia'), Layer: 'S-_COLN----_T2' },
        { ...beamRecord, Layer: 'S-_WALL----_E', Profile: 'PL300' },
        { ...beamRecord, Layer: 'S-_SLAB----_E', Profile: 'PL200' },
        { ...beamRecord, Layer: 'S-_FOOTING----_E', Profile: '1500×1500' },
        { ...beamRecord, Layer: 'S-_PILE----_E', Profile: 'D400' },
        { ...beamRecord, Layer: 'S-_ANOTGRID_E', Profile: '900x900' },
        { ...beamRecord, Layer: 'S-_COLN----_T', Profile: '900x900' },
        { ...beamRecord, Layer: 'S-_WALL----_E', Type: 'HATCH', Profile: 'PL900' }
    ]);
    assert.deepEqual(profiles, {
        polybeam: ['250*500'], column: ['D650'], beam: [], wall: ['PL300'],
        slab: ['PL200'], footing: ['1500*1500'], pile: ['D400']
    });
});

test('Brain fills selected per-type profile textboxes only for unambiguous nonempty DXF data', async () => {
    const page = readFileSync(new URL('../pages/workflowBuilder.html', import.meta.url), 'utf8');
    const start = page.indexOf('      if (cur.type === "brain") {');
    const end = page.indexOf('      if (cur.type === "mcp") {', start);
    const sourceProfiles = {
        polybeam: '250x500', column: '650x650', wall: 'PL300',
        slab: 'PL200', footing: '1500x1500', pile: 'D400'
    };
    for (const mode of ['detected', 'entered', 'empty', 'mixed', 'unselected']) {
        const inputs = Object.fromEntries(Object.keys(sourceProfiles).map(type => [
            type, { value: mode === 'entered' ? 'CUSTOM' : '', placeholder: 'old placeholder' }
        ]));
        const records = [beamRecord];
        for (const [type, profile] of Object.entries(sourceProfiles)) {
            records.push({ ...beamRecord, Type: type === 'polybeam' ? 'ARC' : 'LINE', Layer: `S-_${type.toUpperCase()}----_E`, Profile: mode === 'empty' ? ' ' : profile });
            if (mode === 'mixed') records.push({
                ...beamRecord, Type: type === 'polybeam' ? 'ARC' : 'LINE', Layer: `S-_${type.toUpperCase()}----_E`, Profile: 'OTHER'
            });
        }
        const state = { fileText: JSON.stringify(records) };
        const beamInput = { value: '' };
        const context = vm.createContext({
            state,
            cur: { type: 'brain', el: { querySelector: selector =>
                selector === '[data-k="beam_profile"]' ? beamInput :
                    inputs[selector.match(/data-k="(\w+)_profile"/)?.[1]] || {} } },
            readFlow: () => ({
                script: 'supraesophageal_ganglion_4_dxf.js', type_beam: true,
                ...Object.fromEntries(Object.keys(inputs).flatMap(type => [
                    [`type_${type}`, mode !== 'unselected'], [`${type}_profile`, inputs[type].value]
                ]))
            }),
            ensureToken: async () => 'test',
            fetch: async (_url, options) => {
                const body = JSON.parse(options.body);
                return { ok: true, json: async () => brainToTekla(body.records, body.types, body.defaults) };
            },
            renderBrain() {}
        });
        await vm.runInContext(`(async () => { ${page.slice(start, end)} })()`, context);
        for (const [type, profile] of Object.entries(sourceProfiles)) {
            const expected = mode === 'entered' ? 'CUSTOM' : mode === 'detected' ? profile.replace('x', '*') : '';
            assert.equal(inputs[type].value, expected, `${type}: ${mode}`);
            assert.equal(state.brainDefaults[type].profile, expected);
            if (mode === 'mixed') assert.match(inputs[type].placeholder, /Multiple DXF .* profiles: .*OTHER/);
            if (mode === 'empty') assert.equal(inputs[type].placeholder, 'profile (blank = from DXF)');
        }
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

test('beam modeling rejects all non-LINE/ARC entities even with usable endpoints and vertices', () => {
    const records = ['POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'POINT', 'TEXT', 'MTEXT', 'SPLINE'].map(Type => ({
        ...beamRecord, Handle: Type, Type, Profile: '900x900',
        Vertices: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }]
    }));
    const converted = convertDxfJson(records);
    assert.equal(converted.calls.length, 0);
    assert.equal(converted.skipped.length, records.length);
    assert.deepEqual(converted.beamProfiles, []);
    const result = brainToTekla(records, ['beam']);
    assert.equal(result.calls.length, 0);
    assert.equal(result.skipped.length, records.length);
    for (const skipped of result.skipped) assert.match(skipped.reason, /only LINE and ARC/);
});

test('polybeam modeling rejects non-ARC entities even with usable endpoints and vertices', () => {
    const records = ['LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'POINT', 'TEXT', 'MTEXT', 'SPLINE'].map(Type => ({
        ...beamRecord, Handle: Type, Type, Layer: 'S-_POLYBEAM----', Profile: '900x900',
        Vertices: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }]
    }));
    const converted = convertDxfJson(records);
    assert.equal(converted.calls.length, 0);
    assert.equal(converted.skipped.length, records.length);
    assert.deepEqual(converted.profilesByType.polybeam, []);
    const result = brainToTekla(records, ['polybeam']);
    assert.equal(result.calls.length, 0);
    assert.equal(result.skipped.length, records.length);
    for (const skipped of result.skipped) assert.match(skipped.reason, /only ARC/);
});

test('polybeam ARC uses arc geometry instead of exported vertices and reports invalid arcs', () => {
    const arc = {
        Handle: 'CURVE', Type: 'ARC', Layer: 'S-_POLYBEAM----',
        Center_X: 0, Center_Y: 0, Radius: 1000, StartAngle: 0, EndAngle: 90,
        Vertices: [{ x: 50, y: 50 }, { x: 60, y: 60 }]
    };
    const result = brainToTekla([arc, { ...arc, Handle: 'BAD', Radius: '' }], ['polybeam'],
        { polybeam: { profile: '300*600', height: 4500 } });
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].tool, 'tekla_create_polybeam');
    const points = result.calls[0].arguments.points;
    assert.deepEqual(points[0], { x: 1000, y: 0, z: 4500 });
    assert.ok(Math.abs(points.at(-1).x) < 1e-8);
    assert.equal(points.at(-1).y, 1000);
    assert.equal(result.calls[0].arguments.profile, '300*600');
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /radius/i);
});

test('LINE beams use endpoints rather than unrelated exported vertices', () => {
    const result = brainToTekla([{
        ...beamRecord, Vertices: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 10 }]
    }], ['beam']);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].tool, 'tekla_create_beam');
    assert.equal(result.calls[0].arguments.x1, beamRecord.Start_X);
    assert.equal(result.calls[0].arguments.y2, beamRecord.End_Y);
});

test('paired LINE boundaries produce one centerline beam and retain a genuine crossing', () => {
    const records = [
        { ...beamRecord, Handle: '19A', Start_X: 14645.04, End_X: 14645.04, Start_Y: 23859.34, End_Y: 27384.34 },
        { ...beamRecord, Handle: '19B', Start_X: 14945.04, End_X: 14945.04, Start_Y: 27384.34, End_Y: 23859.34 },
        { ...beamRecord, Handle: 'COPY', Start_X: 14645.04, End_X: 14645.04, Start_Y: 23859.34, End_Y: 27384.34 },
        { ...beamRecord, Handle: 'CROSS', Start_X: 13000, End_X: 16000, Start_Y: 25000, End_Y: 25000 },
        sizeTag('300x600')
    ];
    const result = brainToTekla(records, ['beam'], { beam: { height: 4500 } });
    assert.equal(result.calls.length, 2);
    const args = result.calls.find(call => call.handle === '19A').arguments;
    assert.deepEqual([args.x1, args.y1, args.z1, args.x2, args.y2, args.z2],
        [14795.04, 23859.34, 4500, 14795.04, 27384.34, 4500]);
    assert.ok(result.calls.some(call => call.handle === 'CROSS'));
    assert.match(result.skipped.find(call => call.handle === '19B').reason, /centerline/);
    assert.match(result.skipped.find(call => call.handle === 'COPY').reason, /duplicate/);
});

test('concentric ARC boundaries produce one polybeam at their average radius', () => {
    for (const type of ['beam', 'polybeam']) {
        const arc = {
            Type: 'ARC', Layer: `S-_${type.toUpperCase()}----_E`,
            Center_X: 2795.04, Center_Y: 27709.34, Center_Z: 2500,
            StartAngle: -80, EndAngle: -60, Profile: '300x600'
        };
        const result = brainToTekla([
            { ...arc, Handle: 'INNER', Radius: 23850, Length_mm: 8325.22 },
            { ...arc, Handle: 'OUTER', Radius: 24150, Length_mm: 8429.94 }
        ], [type]);
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0].tool, 'tekla_create_polybeam');
        for (const p of result.calls[0].arguments.points) {
            assert.ok(Math.abs(Math.hypot(p.x - 2795.04, p.y - 27709.34) - 24000) < 1e-8);
            assert.equal(p.z, 2500);
        }
        assert.match(result.skipped[0].reason, /centerline/);
    }
});

test('beam pairing preserves ambiguous, offset, different-level and incompatible members', () => {
    const line = { ...beamRecord, Profile: '300x600', Start_Y: 0, End_Y: 3000 };
    for (const extra of [
        { Start_X: 500, End_X: 500 },
        { Start_X: 300, End_X: 300, Start_Y: 100, End_Y: 3100 },
        { Start_X: 300, End_X: 300, Start_Z: 3000, End_Z: 3000 },
        { Start_X: 300, End_X: 300, Profile: '400x600' },
        { Start_X: 300, End_X: 300, Width_mm: 650, Depth_mm: 650 },
        { Start_X: 300, End_X: 300, Material: 'STEEL' }
    ]) {
        const result = brainToTekla([{ ...line, Handle: 'A' }, { ...line, Handle: 'B', ...extra }], ['beam']);
        assert.equal(result.calls.length, 2);
    }
    const ambiguous = brainToTekla([0, 300, 600].map((x, i) => ({
        ...line, Handle: String(i), Start_X: x, End_X: x
    })), ['beam']);
    assert.equal(ambiguous.calls.length, 3);
});

test('LINE beam uses source length and section dimensions when all are positive', () => {
    const result = brainToTekla([{
        ...beamRecord, Start_X: 10, Start_Y: 20, End_X: 10, End_Y: 3020,
        Length_mm: 1200, Width_mm: 300, Depth_mm: 600, Profile: '150x250'
    }], ['beam']);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(
        Object.fromEntries(['x1', 'y1', 'x2', 'y2', 'profile'].map(key => [key, result.calls[0].arguments[key]])),
        { x1: 10, y1: 20, x2: 10, y2: 1220, profile: '300*600' }
    );
    assert.equal(result.calls[0].profileFrom, 'Width_mm x Depth_mm');
});

test('dimensionedBeam applies all positive source dimensions and leaves incomplete dimensions unapplied', () => {
    assert.deepEqual(dimensionedBeam(
        { x: 10, y: 20, z: 0 }, { x: 10, y: 3020, z: 0 },
        { length: 1200, width: 300, depth: 600 }
    ), { endPoint: { x: 10, y: 1220, z: 0 }, profile: '300*600' });
    assert.equal(dimensionedBeam(
        { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
        { length: 100, width: 300, depth: 0 }
    ), null);
    assert.throws(() => dimensionedBeam(
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
        { length: 100, width: 300, depth: 600 }
    ), /non-zero direction/);
});

test('LINE beam does not apply source length unless all three dimensions are positive', () => {
    for (const [dimensions, expectedProfile] of [
        [{ Length_mm: 1200, Width_mm: 300 }, '300*300'],
        [{ Length_mm: 1200, Depth_mm: 600 }, '600*600'],
        [{ Length_mm: 0, Width_mm: 300, Depth_mm: 600 }, '300*600']
    ]) {
        const result = brainToTekla([{
            ...beamRecord, Start_X: 10, Start_Y: 20, End_X: 10, End_Y: 3020, ...dimensions
        }], ['beam'], { beam: { profile: '' } });
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0].arguments.y2, 3020);
        assert.equal(result.calls[0].arguments.profile, expectedProfile);
    }
});

test('entered Z levels override DXF coordinates for LINE beams, ARC members and slabs', () => {
    const arc = {
        Type: 'ARC', Center_X: 100, Center_Y: 200, Center_Z: 2500,
        Elevation_mm: 1200, Radius: 1000, StartAngle: 0, EndAngle: 90
    };
    const cases = [
        ['beam', { ...beamRecord, Start_Z: 100, End_Z: 200 }, [100, 200]],
        ['beam', { ...arc, Layer: 'S-_BEAM----' }, [2500]],
        ['polybeam', { ...arc, Layer: 'S-_POLYBEAM----' }, [2500]],
        ['slab', {
            Type: 'LWPOLYLINE', Layer: 'S-_SLAB----_E', Closed: 'Yes',
            Vertices: [{ x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 200 }, { x: 100, y: 100, z: 300 }]
        }, [100, 200, 300]]
    ];
    for (const [type, record, sourceZ] of cases) {
        for (const height of ['4500', '0', '-500', '', undefined]) {
            const result = brainToTekla([record], [type], { [type]: { height } });
            assert.equal(result.calls.length, 1, `${type}: ${height}`);
            const args = result.calls[0].arguments;
            const actual = args.points ? [...new Set(args.points.map(p => p.z))] :
                type === 'slab' ? [args.z1, args.z2, args.z3] : [args.z1, args.z2];
            const expected = height === '' || height === undefined ? sourceZ : actual.map(() => Number(height));
            assert.deepEqual(actual, expected, `${type}: ${height}`);
        }
    }
});

test('ARC beam becomes one polybeam with wraparound, elevation and at most 1 mm chord deviation', () => {
    const result = brainToTekla([{
        Handle: '2C6', Type: 'ARC', Layer: 'S-_BEAM----',
        Center_X: 100, Center_Y: 200, Center_Z: 2500,
        Radius: 30000, StartAngle: 350, EndAngle: 80
    }], ['beam'], { beam: { profile: '300*600', height: '' } });
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
