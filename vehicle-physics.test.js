const CANNON = require('cannon-es');

// Mirror the exact tuning values from main.js
const tuning = {
    gravity: -50,
    engineForce: 8000,
    steerAngle: 0.52,
    suspensionStiffness: 30,
    suspensionRest: 1.5,
    frictionSlip: 5,
    rollInfluence: 0.1,
    carMass: 1000,
};

// Mirror the exact vehicle setup from entities.js
function createTestVehicle(world) {
    const width = 4.5;
    const height = 2.5;
    const depth = 7;

    const chassisBody = new CANNON.Body({
        mass: tuning.carMass,
        material: new CANNON.Material('car'),
    });
    chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
    chassisBody.position.set(0, 5, 0);
    chassisBody.angularDamping = 0.5;
    // Current code: chassis collides with floor
    chassisBody.collisionFilterGroup = 0x0002;
    chassisBody.collisionFilterMask = 0x0001 | 0x0004 | 0x0008 | 0x0010;

    // cannon-es defaults: X=forward, Z=right. Our car uses Z=forward, X=right.
    const vehicle = new CANNON.RaycastVehicle({
        chassisBody,
        indexForwardAxis: 2,
        indexRightAxis: 0,
        indexUpAxis: 1,
    });

    const distW = width / 2 + 0.5;
    const distL = depth / 2 - 1.5;
    const wheelOptions = {
        radius: 1.2,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: tuning.suspensionStiffness,
        suspensionRestLength: tuning.suspensionRest,
        maxSuspensionTravel: 1.0,
        frictionSlip: tuning.frictionSlip,
        dampingRelaxation: 2.5,
        dampingCompression: 4.5,
        maxSuspensionForce: 100000,
        rollInfluence: tuning.rollInfluence,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(),
    };

    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, 0, distL) });
    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, 0, distL) });
    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, 0, -distL) });
    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, 0, -distL) });

    vehicle.addToWorld(world);
    return { vehicle, chassisBody };
}

function createTestWorld() {
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, tuning.gravity, 0),
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;

    // Floor - thick box, top surface at y=0
    const floorBody = new CANNON.Body({
        mass: 0,
        material: new CANNON.Material('floor'),
    });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(50, 0.5, 80)));
    floorBody.position.set(0, -0.5, 0);
    floorBody.collisionFilterGroup = 0x0001;
    floorBody.collisionFilterMask = 0xFFFF;
    world.addBody(floorBody);

    // Contact materials
    world.addContactMaterial(new CANNON.ContactMaterial(
        floorBody.material, new CANNON.Material('car'),
        { friction: 0.05, restitution: 0.0 }
    ));

    return world;
}

// --- Test helpers ---
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  PASS: ${message}`);
        passed++;
    } else {
        console.log(`  FAIL: ${message}`);
        failed++;
    }
}

// --- Tests ---

function testWheelGroundContact() {
    console.log('\nTest: Wheels make ground contact after settling');
    const world = createTestWorld();
    const { vehicle, chassisBody } = createTestVehicle(world);

    // Let the car settle for 2 seconds
    for (let i = 0; i < 120; i++) {
        world.step(1 / 60);
    }

    let wheelsInContact = 0;
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        if (vehicle.wheelInfos[i].isInContact) wheelsInContact++;
    }

    assert(wheelsInContact === 4, `Expected 4 wheels on ground, got ${wheelsInContact}`);
    assert(Math.abs(chassisBody.velocity.y) < 1, `Car should be settled (vy=${chassisBody.velocity.y.toFixed(2)})`);
    assert(chassisBody.position.y > 0.5 && chassisBody.position.y < 5, `Car at reasonable height (y=${chassisBody.position.y.toFixed(2)})`);
}

function testForwardDrive() {
    console.log('\nTest: Engine force propels car forward (+Z), not sideways');
    const world = createTestWorld();
    const { vehicle, chassisBody } = createTestVehicle(world);

    // Let the car settle first
    for (let i = 0; i < 120; i++) {
        world.step(1 / 60);
    }

    const startPos = chassisBody.position.clone();
    const startVelX = chassisBody.velocity.x;
    const startVelZ = chassisBody.velocity.z;
    console.log(`  Start pos: (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)})`);

    // Apply engine force for 2 seconds (same as game: forward=-1 means negative engine force on rear wheels)
    for (let i = 0; i < 120; i++) {
        vehicle.applyEngineForce(-1 * tuning.engineForce, 2); // rear left
        vehicle.applyEngineForce(-1 * tuning.engineForce, 3); // rear right
        world.step(1 / 60);
    }

    const endPos = chassisBody.position.clone();
    const deltaX = endPos.x - startPos.x;
    const deltaZ = endPos.z - startPos.z;
    const speed = chassisBody.velocity.length();

    console.log(`  End pos:   (${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)}, ${endPos.z.toFixed(2)})`);
    console.log(`  Delta:     x=${deltaX.toFixed(2)}, z=${deltaZ.toFixed(2)}`);
    console.log(`  Velocity:  (${chassisBody.velocity.x.toFixed(2)}, ${chassisBody.velocity.y.toFixed(2)}, ${chassisBody.velocity.z.toFixed(2)})`);
    console.log(`  Speed:     ${speed.toFixed(2)}`);

    assert(speed > 5, `Car should be moving (speed=${speed.toFixed(2)})`);
    assert(Math.abs(deltaZ) > 5, `Car should have moved significantly in Z (deltaZ=${deltaZ.toFixed(2)})`);
    assert(Math.abs(deltaZ) > Math.abs(deltaX) * 3, `Z movement (${deltaZ.toFixed(2)}) should dominate X movement (${deltaX.toFixed(2)})`);
    assert(deltaZ > 0, `Car should move in +Z direction (deltaZ=${deltaZ.toFixed(2)})`);
}

function testNoInputNoDrift() {
    console.log('\nTest: Car does not drift when no input is applied');
    const world = createTestWorld();
    const { vehicle, chassisBody } = createTestVehicle(world);

    // Let the car settle
    for (let i = 0; i < 120; i++) {
        world.step(1 / 60);
    }

    const startPos = chassisBody.position.clone();

    // Run 2 more seconds with no input
    for (let i = 0; i < 120; i++) {
        world.step(1 / 60);
    }

    const endPos = chassisBody.position.clone();
    const drift = Math.sqrt((endPos.x - startPos.x) ** 2 + (endPos.z - startPos.z) ** 2);

    console.log(`  Drift distance: ${drift.toFixed(4)}`);
    assert(drift < 0.5, `Car should not drift without input (drift=${drift.toFixed(4)})`);
}

function testSteeringDirection() {
    console.log('\nTest: Positive steer value turns car left (-X)');
    const world = createTestWorld();
    const { vehicle, chassisBody } = createTestVehicle(world);

    // Settle
    for (let i = 0; i < 120; i++) {
        world.step(1 / 60);
    }

    const startPos = chassisBody.position.clone();

    // Drive forward + steer left (game: A/ArrowLeft → steer=+1)
    // Apply negative steer to vehicle (matching the fix in applyInput)
    for (let i = 0; i < 60; i++) {
        vehicle.applyEngineForce(-1 * tuning.engineForce, 2);
        vehicle.applyEngineForce(-1 * tuning.engineForce, 3);
        // Negate steer just like entities.js applyInput does
        vehicle.setSteeringValue(-1 * tuning.steerAngle, 0);
        vehicle.setSteeringValue(-1 * tuning.steerAngle, 1);
        world.step(1 / 60);
    }

    const deltaX = chassisBody.position.x - startPos.x;
    const deltaZ = chassisBody.position.z - startPos.z;

    console.log(`  Delta: x=${deltaX.toFixed(2)}, z=${deltaZ.toFixed(2)}`);
    assert(deltaZ > 0, `Car should move forward (+Z) while turning (deltaZ=${deltaZ.toFixed(2)})`);
    assert(deltaX < 0, `Positive steer should turn car left (-X) (deltaX=${deltaX.toFixed(2)})`);
}

// --- Run ---
console.log('=== Vehicle Physics Tests ===');
testWheelGroundContact();
testForwardDrive();
testNoInputNoDrift();
testSteeringDirection();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
