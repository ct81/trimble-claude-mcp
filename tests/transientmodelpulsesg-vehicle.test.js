import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createVehicleSimulation } from '../pages/misc/transientmodelpulsesg-vehicle.js';

function createTestVehicle() {
    class Object3D {
        children = [];
        rotation = {};
        position = { set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
        add(...children) { this.children.push(...children); }
    }
    class Geometry { rotateZ() {} }
    const scene = new Object3D();
    const simulation = createVehicleSimulation({
        Group: Object3D, Mesh: Object3D, BoxGeometry: Geometry, CylinderGeometry: Geometry,
        MeshStandardMaterial: class {}, MeshBasicMaterial: class {}
    }, scene, -0.15);
    return { simulation, vehicle: scene.children[0] };
}

test('the main toolbar can start and stop the vehicle without applying a ground map', () => {
    const page = readFileSync(new URL('../pages/misc/transientmodelpulsesg.html', import.meta.url), 'utf8');
    const toolbar = page.match(/<div class="toolbar">([\s\S]*?)\n        <\/div>/)?.[1];
    const buttonMarkup = toolbar?.match(/<button\b([^>]*\bid="btn-vehicle"[^>]*)>([^<]+)<\/button>\s*<button\b[^>]*\bid="open-leaflet-map"/);
    assert.ok(buttonMarkup, 'vehicle button immediately precedes Map in the toolbar');
    assert.doesNotMatch(buttonMarkup[1], /\b(?:hidden|disabled)\b/);
    assert.match(buttonMarkup[1], /title="Start vehicle"/);
    assert.match(buttonMarkup[1], /aria-label="Start vehicle"/);

    const button = {
        textContent: buttonMarkup[2],
        title: 'Start vehicle',
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, handler) {
            assert.equal(type, 'click');
            this.click = handler;
        }
    };
    const { simulation, vehicle } = createTestVehicle();
    const start = page.indexOf('        const btnVehicle =');
    const end = page.indexOf('        function updateGroundMapLinks()', start);
    assert.ok(start >= 0 && end > start);
    const context = vm.createContext({
        document: { getElementById: id => id === 'btn-vehicle' ? button : null },
        vehicleSimulation: simulation,
        controls: { target: { x: 0, z: 0 } }
    });
    vm.runInContext(page.slice(start, end), context);

    assert.equal(button.textContent, '▶');
    button.click();
    assert.equal(vehicle.visible, true);
    assert.equal(button.textContent, '■');
    assert.equal(button.title, 'Stop vehicle');
    assert.equal(button['aria-label'], 'Stop vehicle');
    button.click();
    assert.equal(vehicle.visible, false);
    assert.equal(button.textContent, '▶');
    assert.equal(button.title, 'Start vehicle');
    assert.equal(button['aria-label'], 'Start vehicle');
    button.click();
    vm.runInContext('stopVehicleSimulation()', context);
    assert.equal(vehicle.visible, false);
    assert.equal(button.textContent, '▶');
    assert.equal(button.title, 'Start vehicle');
    assert.equal(button['aria-label'], 'Start vehicle');
});

test('the 3D demo advances at the same speed across frame rates and faces its direction of travel', () => {
    function run(fps) {
        const { simulation, vehicle } = createTestVehicle();
        const focus = { x: 54, z: -16 };
        simulation.start(focus);
        const startX = vehicle.position.x, startZ = vehicle.position.z;
        focus.x += 100; // Changing the camera focus must not move the route.
        for (let frame = 0; frame <= fps; frame++) simulation.update(1000 * frame / fps);
        const { x, y, z } = vehicle.position;
        assert.equal(y, -0.15);
        assert.ok(Math.abs(Math.hypot(x - startX, z - startZ) - 4) < 0.02);

        const heading = vehicle.rotation.y;
        simulation.update(1010);
        const dx = vehicle.position.x - x, dz = vehicle.position.z - z;
        assert.ok((dx * Math.sin(heading) + dz * Math.cos(heading)) / Math.hypot(dx, dz) > 0.999);
        return { x, z };
    }
    const slower = run(30), faster = run(60);
    assert.ok(Math.hypot(slower.x - faster.x, slower.z - faster.z) < 1e-9);
});

test('the vehicle limits jumps after long frame gaps and starts fresh after stopping', () => {
    const { simulation, vehicle } = createTestVehicle();
    assert.equal(vehicle.visible, false);
    simulation.start({ x: 0, z: 0 });
    simulation.update(0);
    const { x, z } = vehicle.position;
    simulation.update(60000);
    assert.ok(Math.hypot(vehicle.position.x - x, vehicle.position.z - z) < 0.5);

    simulation.stop();
    assert.equal(vehicle.visible, false);
    simulation.start({ x: 88, z: 28 });
    const restartX = vehicle.position.x, restartZ = vehicle.position.z;
    simulation.update(80000);
    assert.equal(vehicle.visible, true);
    assert.equal(restartX - x, 88);
    assert.equal(restartZ - z, 28);
    assert.equal(vehicle.position.x, restartX);
    assert.equal(vehicle.position.z, restartZ);
});
