import assert from 'node:assert/strict';
import test from 'node:test';
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
