import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapPlacement, getGroundBounds } from '../pages/misc/transientmodelpulsesg-ground-map.js';

const mercator = {
    latLngToPoint({ lat, lng }, zoom) {
        const size = 256 * 2 ** zoom;
        const radians = lat * Math.PI / 180;
        return { x: size * (lng + 180) / 360, y: size * (0.5 - Math.asinh(Math.tan(radians)) / (2 * Math.PI)) };
    },
    pointToLatLng({ x, y }, zoom) {
        const size = 256 * 2 ** zoom;
        return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI, lng: 360 * x / size - 180 };
    }
};

test('a geographic point stays fixed to the specified local grid point at different tile zooms', () => {
    const anchor = { lat: 1.3521, lng: 103.8198, x: -40, z: 120 };
    const placement = createMapPlacement(mercator, anchor);
    for (const zoom of [14, 19]) {
        const pixel = mercator.latLngToPoint(anchor, zoom);
        assert.deepEqual(placement.toWorld(pixel.x, pixel.y, zoom), { x: -40, z: 120 });
    }

    // At this latitude, 0.001° east is about 111 metres and north is negative Z.
    const nearby = mercator.latLngToPoint({ lat: anchor.lat + 0.001, lng: anchor.lng + 0.001 }, 19);
    const world = placement.toWorld(nearby.x, nearby.y, 19);
    assert.ok(Math.abs(world.x - (anchor.x + 111.29)) < 0.05);
    assert.ok(Math.abs(world.z - (anchor.z - 111.32)) < 0.05);
});

test('Leaflet requests a new window when panning and more detail when zooming toward the grid', () => {
    const placement = createMapPlacement(mercator, { lat: 1.3521, lng: 103.8198, x: 0, z: 0 });
    const start = placement.getView({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, 1280);
    const panned = placement.getView({ minX: 500, maxX: 1500, minZ: -500, maxZ: 500 }, 1280);
    const zoomed = placement.getView({ minX: 975, maxX: 1025, minZ: -25, maxZ: 25 }, 1280);
    assert.equal(panned.zoom, start.zoom);
    assert.ok(panned.center.lng > start.center.lng);
    assert.ok(zoomed.zoom > panned.zoom);
    const pixels = mercator.latLngToPoint(zoomed.center, zoomed.zoom);
    const world = placement.toWorld(pixels.x, pixels.y, zoomed.zoom);
    assert.ok(Math.abs(world.x - 1000) < 20 && Math.abs(world.z) < 20);
});

test('tile coverage uses the intersection of the camera frustum and the grid plane', () => {
    const frustum = [
        { x: -1, y: 3, z: -1 }, { x: 1, y: 3, z: -1 },
        { x: -1, y: 3, z: 1 }, { x: 1, y: 3, z: 1 },
        { x: -5, y: -1, z: -5 }, { x: 5, y: -1, z: -5 },
        { x: -5, y: -1, z: 5 }, { x: 5, y: -1, z: 5 }
    ];
    assert.deepEqual(getGroundBounds(frustum, 0), { minX: -4, minZ: -4, maxX: 4, maxZ: 4 });
    assert.equal(getGroundBounds(frustum, -2), null);
});
