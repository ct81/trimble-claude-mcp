const LOOP_RADIUS = 12;
const SPEED = 4;
const WHEEL_RADIUS = 0.38;
const LAP_LENGTH = 2 * Math.PI * LOOP_RADIUS;

export function createVehicleSimulation(THREE, scene, groundY) {
    const vehicle = new THREE.Group();
    vehicle.name = 'Demo vehicle';
    vehicle.visible = false;
    scene.add(vehicle);

    const paint = new THREE.MeshStandardMaterial({ color: 0xff9326, roughness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x25445d, roughness: 0.35 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x202530 });
    const headlight = new THREE.MeshBasicMaterial({ color: 0xffeed0 });
    const taillight = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    function box(width, height, length, x, y, z, material) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
        mesh.position.set(x, y, z);
        vehicle.add(mesh);
    }

    // The front of the pickup points along local +Z.
    box(1.95, 0.65, 4.5, 0, 0.78, 0, paint);
    box(1.78, 0.68, 1.65, 0, 1.44, 0.45, glass);
    box(1.82, 0.12, 1.7, 0, 1.82, 0.45, paint);
    box(1.55, 0.07, 1.2, 0, 1.12, -1.42, trim);
    for (const x of [-0.69, 0.69]) {
        box(0.39, 0.18, 0.04, x, 0.87, 2.26, headlight);
        box(0.22, 0.22, 0.04, x, 0.87, -2.26, taillight);
    }

    const tireGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = new THREE.BoxGeometry(0.32, 0.18, 0.18);
    const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xa5adbd });
    const wheels = [];
    for (const x of [-0.92, 0.92]) {
        for (const z of [-1.4, 1.4]) {
            const wheel = new THREE.Group();
            wheel.position.set(x, WHEEL_RADIUS, z);
            wheel.add(new THREE.Mesh(tireGeometry, trim), new THREE.Mesh(hubGeometry, hubMaterial));
            vehicle.add(wheel);
            wheels.push(wheel);
        }
    }

    let centerX, centerZ, distance, wheelAngle, lastTime;
    function updatePose() {
        const angle = distance / LOOP_RADIUS;
        vehicle.position.set(centerX + LOOP_RADIUS * Math.sin(angle), groundY, centerZ - LOOP_RADIUS * Math.cos(angle));
        vehicle.rotation.y = Math.PI / 2 - angle;
        for (const wheel of wheels) wheel.rotation.x = wheelAngle;
    }

    return {
        get running() { return vehicle.visible; },
        start({ x, z }) {
            centerX = x;
            centerZ = z;
            distance = wheelAngle = 0;
            lastTime = undefined;
            updatePose();
            vehicle.visible = true;
        },
        stop() {
            vehicle.visible = false;
        },
        update(time) {
            if (!vehicle.visible) return;
            // Limit catch-up so resuming a suspended tab does not jump around the loop.
            const step = lastTime === undefined ? 0 : SPEED * Math.min(time - lastTime, 100) / 1000;
            lastTime = time;
            distance = (distance + step) % LAP_LENGTH;
            wheelAngle = (wheelAngle + step / WHEEL_RADIUS) % (2 * Math.PI);
            updatePose();
        }
    };
}
