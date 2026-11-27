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

test('interactive Leaflet pans and zooms the aligned model and restores the 3D view on hide', t => {
    const previousL = globalThis.L, previousDocument = globalThis.document;
    t.after(() => { globalThis.L = previousL; globalThis.document = previousDocument; });
    const source = { hidden: true, clientWidth: 1200, clientHeight: 800 };
    globalThis.document = { getElementById: () => source };
    const maps = [], layers = [];
    globalThis.L = {
        CRS: { EPSG3857: crs },
        map(element, options) {
            const map = {
                options, on(events, handler) { this.handler = handler; },
                getSize: () => ({ x: element.clientWidth, y: element.clientHeight }),
                setView(center, zoom) { this.center = center; this.zoom = zoom; this.handler(); },
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
    const camera = { position: vector(40, 30, 40), up: vector(0, 1, 0), fov: 45, lookAt() {} };
    const controls = { target: vector(10, 0, 20), enabled: true, update() {} };
    const classes = new Set();
    const container = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
    const ground = createGroundMap({}, {}, -.15, message => assert.fail(message), { camera, controls, container });
    assert.equal(ground.show({ lat: 1.3521, lng: 103.8198, x: 10, z: 20 }, 'Street'), true);
    assert.equal(source.hidden, false);
    assert.equal(controls.enabled, false);
    assert.ok(classes.has('leaflet-ground-active'));
    assert.match(layers[0], /openstreetmap/);
    assert.ok(Math.abs(camera.position.x - 10) < 1e-8);
    assert.ok(Math.abs(camera.position.z - 20) < 1e-8);
    assert.equal(camera.up.z, -1);
    const map = maps[0], height = camera.position.y + .15;
    map.setView({ lat: 1.3531, lng: 103.8208 }, map.zoom + 1);
    assert.ok(Math.abs(camera.position.x - 121.29) < .1);
    assert.ok(Math.abs(camera.position.z + 91.32) < .1);
    assert.ok(Math.abs((camera.position.y + .15) - height / 2) < 1e-8);
    assert.ok(Math.abs(camera.position.x - controls.target.x) < 1e-8);
    camera.position.y = -.15 + height;
    ground.update();
    assert.ok(Math.abs((camera.position.y + .15) - height) < 1e-8, 'Camera zoom propagates back to Leaflet');
    ground.setLayer('Terrain');
    assert.match(layers.at(-1), /opentopomap/);
    ground.hide();
    assert.equal(source.hidden, true);
    assert.equal(map.removed, true);
    assert.equal(controls.enabled, true);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [40, 30, 40]);
    assert.deepEqual([controls.target.x, controls.target.y, controls.target.z], [10, 0, 20]);
    assert.equal(camera.up.y, 1);
    assert.equal(classes.size, 0);
});
