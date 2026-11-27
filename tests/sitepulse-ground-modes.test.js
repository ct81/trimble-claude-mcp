import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroundMap } from '../pages/sitepulse/sitepulse-ground-map.js';

const crs = {
    latLngToPoint({ lat, lng }, zoom) {
        const size = 256 * 2 ** zoom;
        return { x: size * (lng + 180) / 360, y: size * (.5 - Math.asinh(Math.tan(lat * Math.PI / 180)) / (2 * Math.PI)) };
    },
    pointToLatLng({ x, y }, zoom) {
        const size = 256 * 2 ** zoom;
        return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI, lng: 360 * x / size - 180 };
    }
};
const vector = (x, y, z) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); } });

test('switches between overlay and interactive Leaflet modes, aligns pan/zoom and restores 3D view', t => {
    const oldL = globalThis.L, oldDocument = globalThis.document;
    t.after(() => { globalThis.L = oldL; globalThis.document = oldDocument; });
    const source = { hidden: true, clientWidth: 1200, clientHeight: 800 }, maps = [], layers = [];
    globalThis.document = { getElementById: id => id === 'interactive-ground-map' ? source : {} };
    globalThis.L = {
        CRS: { EPSG3857: crs },
        map(element, options) {
            const map = {
                options, on(events, handler) { this.handler = handler; },
                getSize: () => ({ x: 1200, y: 800 }),
                setView(center, zoom) { this.center = center; this.zoom = zoom; this.handler?.(); },
                getCenter() { return this.center; }, getZoom() { return this.zoom; },
                invalidateSize() {}, removeLayer() {}, remove() { this.removed = true; }
            };
            maps.push(map);
            return map;
        },
        tileLayer(url) {
            layers.push(url);
            return { on() { return this; }, addTo() { return this; } };
        }
    };
    class Group { add() {} remove() {} }
    class Matrix4 { elements = []; }
    const THREE = {
        Group, Matrix4, Vector3: class {}, PlaneGeometry: class { rotateX() {} }
    };
    const camera = { position: vector(40, 30, 40), up: vector(0, 1, 0), fov: 45, lookAt() {} };
    const controls = { target: vector(10, 0, 20), enabled: true, update() {} };
    const classes = new Set();
    const container = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
    const ground = createGroundMap(THREE, { add() {} }, -.15, message => assert.fail(message), { camera, controls, container });
    const anchor = { lat: 1.3521, lng: 103.8198, x: 10, z: 20 };
    assert.equal(ground.show(anchor, 'Street'), true);
    assert.equal(ground.mode, 'overlay');
    assert.equal(maps[0].options.dragging, false);
    assert.equal(ground.setMode('interactive'), true);
    assert.equal(maps[0].removed, true);
    assert.equal(source.hidden, false);
    assert.equal(controls.enabled, false);
    assert.ok(classes.has('interactive-ground-active'));
    assert.match(layers.at(-1), /openstreetmap/);
    assert.ok(Math.abs(camera.position.x - 10) < 1e-8);
    assert.ok(Math.abs(camera.position.z - 20) < 1e-8);
    assert.equal(camera.up.z, -1);
    const map = maps[1], height = camera.position.y + .15;
    map.setView({ lat: 1.3531, lng: 103.8208 }, map.zoom + 1);
    assert.ok(Math.abs(camera.position.x - 121.29) < .1);
    assert.ok(Math.abs(camera.position.z + 91.32) < .1);
    assert.ok(Math.abs(camera.position.y + .15 - height / 2) < 1e-8);
    assert.equal(ground.update(camera), true, 'Map movement refreshes navigation links');
    assert.equal(ground.update(camera), false);
    ground.setLayer('Transit');
    assert.match(layers.at(-1), /memomaps/);
    assert.equal(ground.setMode('overlay'), true);
    assert.equal(map.removed, true);
    assert.equal(source.hidden, true);
    assert.equal(controls.enabled, true);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [40, 30, 40]);
    assert.deepEqual([controls.target.x, controls.target.y, controls.target.z], [10, 0, 20]);
    assert.match(layers.at(-1), /cartocdn/, 'Overlay retains its WebGL-compatible Transit provider');
    ground.hide();
    assert.equal(ground.visible, false);
    assert.equal(classes.size, 0);
    assert.equal(ground.setMode('interactive'), true);
    assert.equal(ground.show(anchor, 'Street'), true);
    ground.hide();
    assert.equal(source.hidden, true);
    assert.equal(controls.enabled, true);
});
