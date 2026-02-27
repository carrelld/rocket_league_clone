import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Tunable Parameters (exposed to dev panel) ---
const tuning = {
    gravity: -50,
    engineForce: 8000,
    steerAngle: 0.52,  // ~30 degrees
    jumpImpulse: 20000,
    brakeForce: 100,
    suspensionStiffness: 30,
    suspensionRest: 1.5,
    frictionSlip: 5,
    rollInfluence: 0.1,
    ballMass: 30,
    carMass: 1000,
    airPitchTorque: 5000,
    airYawTorque: 4000,
    cameraHeight: 10,
    cameraDist: 25,
    cameraSmoothing: 0.1,
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.005);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0x202040, 2.0);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xaaccff, 2.5);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 300;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

// Neon accents
const spotLight1 = new THREE.SpotLight(0x00ffff, 1000);
spotLight1.position.set(-60, 20, 0);
spotLight1.lookAt(0, 0, 0);
scene.add(spotLight1);

const spotLight2 = new THREE.SpotLight(0xff00ff, 1000);
spotLight2.position.set(60, 20, 0);
spotLight2.lookAt(0, 0, 0);
scene.add(spotLight2);

// --- Physics World ---
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, tuning.gravity, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 20;

const physicsMaterial = new CANNON.Material('standard');
const physicsContactMaterial = new CANNON.ContactMaterial(
    physicsMaterial, physicsMaterial,
    { friction: 0.1, restitution: 0.6 }
);
world.addContactMaterial(physicsContactMaterial);

const carMaterial = new CANNON.Material('car');
const ballMaterial = new CANNON.Material('ball');
const floorMaterial = new CANNON.Material('floor');
const wallMaterial = new CANNON.Material('wall');
const wheelMaterial = new CANNON.Material('wheel');

world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, ballMaterial, { friction: 0.5, restitution: 1.2 }));
world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, floorMaterial, { friction: 0.2, restitution: 0.8 }));
world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, floorMaterial, { friction: 0.05, restitution: 0.0 }));
world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, wallMaterial, { friction: 0.2, restitution: 0.8 }));
world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, wallMaterial, { friction: 0.1, restitution: 0.2 }));
world.addContactMaterial(new CANNON.ContactMaterial(wheelMaterial, floorMaterial, { friction: 0.6, restitution: 0.0, contactEquationStiffness: 1000 }));

// --- Arena ---
const arenaWidth = 100;
const arenaLength = 160;
const wallHeight = 40;

const createArena = () => {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(arenaWidth, arenaLength);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x080812, roughness: 0.1, metalness: 0.8
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Synthwave Grid
    const gridHelper = new THREE.GridHelper(Math.max(arenaWidth, arenaLength), 40, 0x00d2ff, 0xff00ff);
    gridHelper.position.y = 0.1;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Floor Physics
    const floorShape = new CANNON.Box(new CANNON.Vec3(arenaWidth / 2, 0.1, arenaLength / 2));
    const floorBody = new CANNON.Body({ mass: 0, material: floorMaterial });
    floorBody.addShape(floorShape);
    floorBody.position.set(0, -0.1, 0);
    // Collision group 2: chassis will NOT collide with floor, only suspension rays do
    floorBody.collisionFilterGroup = 2;
    floorBody.collisionFilterMask = -1; // collide with everything that includes group 2 in its mask
    world.addBody(floorBody);

    // Walls
    const wallGeoFront = new THREE.BoxGeometry(arenaWidth, wallHeight, 2);
    const wallGeoSide = new THREE.BoxGeometry(2, wallHeight, arenaLength);
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x111122, transmission: 0.5, opacity: 0.6, transparent: true, roughness: 0.1, metalness: 0.9, side: THREE.DoubleSide
    });

    const addWall = (geo, x, z, shapeVec, ry = 0) => {
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(x, wallHeight / 2, z);
        mesh.rotation.y = ry;
        scene.add(mesh);

        const body = new CANNON.Body({ mass: 0, material: wallMaterial });
        body.addShape(new CANNON.Box(shapeVec));
        body.position.set(x, wallHeight / 2, z);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
        world.addBody(body);
    };

    addWall(wallGeoSide, arenaWidth / 2, 0, new CANNON.Vec3(1, wallHeight / 2, arenaLength / 2));
    addWall(wallGeoSide, -arenaWidth / 2, 0, new CANNON.Vec3(1, wallHeight / 2, arenaLength / 2));
    addWall(wallGeoFront, 0, arenaLength / 2, new CANNON.Vec3(arenaWidth / 2, wallHeight / 2, 1));
    addWall(wallGeoFront, 0, -arenaLength / 2, new CANNON.Vec3(arenaWidth / 2, wallHeight / 2, 1));
};
createArena();

// --- Goals ---
let blueScore = 0;
let orangeScore = 0;
const scoreElement = document.getElementById('score');

const goalWidth = 28;
const goalDepth = 12;
const goalHeight = 12;

const createGoal = (isBlue) => {
    const zPos = isBlue ? arenaLength / 2 : -arenaLength / 2;
    const visualColor = isBlue ? 0x00d2ff : 0xff6a00;

    const goalMat = new THREE.MeshStandardMaterial({
        color: visualColor, emissive: visualColor, emissiveIntensity: 2.0, wireframe: true
    });
    const goalGeo = new THREE.BoxGeometry(goalWidth, goalHeight, goalDepth);
    const goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.position.set(0, goalHeight / 2, zPos + (isBlue ? goalDepth / 2 : -goalDepth / 2));
    scene.add(goalMesh);

    const goalLight = new THREE.PointLight(visualColor, 200, 40);
    goalLight.position.copy(goalMesh.position);
    scene.add(goalLight);

    const sensorShape = new CANNON.Box(new CANNON.Vec3(goalWidth / 2, goalHeight / 2, goalDepth / 2));
    const sensorBody = new CANNON.Body({ mass: 0, isTrigger: true });
    sensorBody.addShape(sensorShape);
    sensorBody.position.copy(goalMesh.position);
    sensorBody.team = isBlue ? 'blue' : 'orange';
    world.addBody(sensorBody);

    return sensorBody;
};

const blueGoalSensor = createGoal(true);
const orangeGoalSensor = createGoal(false);

const scorePoint = (team) => {
    if (team === 'blue') blueScore++;
    else orangeScore++;
    scoreElement.innerHTML = `<span class="team-blue">${blueScore}</span> - <span class="team-orange">${orangeScore}</span>`;

    const flashMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x00d2ff : 0xff6a00, transparent: true, opacity: 0.8 })
    );
    flashMesh.position.z = -10;
    camera.add(flashMesh);
    scene.add(camera);

    let op = 0.8;
    const fadeOut = setInterval(() => {
        op -= 0.05;
        flashMesh.material.opacity = op;
        if (op <= 0) {
            camera.remove(flashMesh);
            clearInterval(fadeOut);
        }
    }, 30);

    resetPositions();
};

world.addEventListener('beginContact', (event) => {
    if (event.bodyA === ballBody || event.bodyB === ballBody) {
        const other = event.bodyA === ballBody ? event.bodyB : event.bodyA;
        if (other === blueGoalSensor) scorePoint('orange');
        else if (other === orangeGoalSensor) scorePoint('blue');
    }
});

const resetPositions = () => {
    ballBody.position.set(0, 15, 0);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);

    chassisBody.position.set(0, 5, -50);
    chassisBody.quaternion.set(0, 0, 0, 1); // identity — front (+Z) faces toward +Z (toward ball)
    chassisBody.velocity.set(0, 0, 0);
    chassisBody.angularVelocity.set(0, 0, 0);
};

// --- Ball ---
const ballRadius = 3.5;
const ballGeometry = new THREE.IcosahedronGeometry(ballRadius, 2);
const ballMaterialVisual = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x222222, roughness: 0.1, metalness: 0.9, wireframe: true
});
const ballCoreMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x444444 });

const ballMesh = new THREE.Group();
const ballOuter = new THREE.Mesh(ballGeometry, ballMaterialVisual);
const ballInner = new THREE.Mesh(new THREE.IcosahedronGeometry(ballRadius - 0.2, 1), ballCoreMat);
ballMesh.add(ballOuter);
ballMesh.add(ballInner);
ballMesh.castShadow = true;
scene.add(ballMesh);

const ballLight = new THREE.PointLight(0xffffff, 100, 30);
ballMesh.add(ballLight);

const ballShape = new CANNON.Sphere(ballRadius);
const ballBody = new CANNON.Body({ mass: tuning.ballMass, material: ballMaterial });
ballBody.addShape(ballShape);
ballBody.position.set(0, 15, 0);
ballBody.linearDamping = 0.1;
ballBody.angularDamping = 0.1;
world.addBody(ballBody);

// --- Car ---
const carGroup = new THREE.Group();
const carWidth = 4.5;
const carHeight = 2.5;
const carDepth = 7;

const carBodyGeo = new THREE.BoxGeometry(carWidth, carHeight, carDepth);
const carBodyMat = new THREE.MeshStandardMaterial({
    color: 0x00d2ff, emissive: 0x002244, roughness: 0.3, metalness: 0.8
});
const visualCarMesh = new THREE.Mesh(carBodyGeo, carBodyMat);
visualCarMesh.position.y = carHeight / 2;
visualCarMesh.castShadow = true;
carGroup.add(visualCarMesh);

// Green front indicator — the FRONT of the car is +Z local
const frontIndicator = new THREE.Mesh(
    new THREE.PlaneGeometry(carWidth * 0.8, carHeight * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.5 })
);
frontIndicator.position.set(0, carHeight / 2, carDepth / 2 + 0.01);
carGroup.add(frontIndicator);

// Wheels
const wheelGeo = new THREE.CylinderGeometry(1.2, 1.2, 1, 32);
const wheelMatVisual = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const wheelPositions = [
    [-carWidth / 2 - 0.5, 1.2, carDepth / 2 - 1.5], [carWidth / 2 + 0.5, 1.2, carDepth / 2 - 1.5],
    [-carWidth / 2 - 0.5, 1.2, -carDepth / 2 + 1.5], [carWidth / 2 + 0.5, 1.2, -carDepth / 2 + 1.5]
];
const wheelMeshes = [];
wheelPositions.forEach(() => {
    const wGroup = new THREE.Group();
    const w = new THREE.Mesh(wheelGeo, wheelMatVisual);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    wGroup.add(w);
    scene.add(wGroup);
    wheelMeshes.push(wGroup);
});

// Neon underglow
const carLight = new THREE.PointLight(0x00d2ff, 150, 20);
carLight.position.set(0, 1, 0);
carGroup.add(carLight);
scene.add(carGroup);

// Physics (RaycastVehicle)
const chassisShape = new CANNON.Box(new CANNON.Vec3(carWidth / 2, carHeight / 2, carDepth / 2));
const chassisBody = new CANNON.Body({ mass: tuning.carMass, material: carMaterial });
chassisBody.addShape(chassisShape);
chassisBody.position.set(0, 5, -50);
chassisBody.angularDamping = 0.5;
// Collision filter: chassis does NOT collide with floor (group 2) so suspension can work
// Mask = all groups except group 2
chassisBody.collisionFilterGroup = 1;
chassisBody.collisionFilterMask = ~2;

const vehicle = new CANNON.RaycastVehicle({
    chassisBody: chassisBody,
});

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

const distW = carWidth / 2 + 0.5;
const distL = carDepth / 2 - 1.5;
// Connection at chassis center -- suspension rays extend downward to reach ground
const connectionY = 0;

vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, connectionY, distL) });
vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, connectionY, distL) });
vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, connectionY, -distL) });
vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, connectionY, -distL) });

vehicle.addToWorld(world);

// --- Input Controls ---
const keys = { w: false, a: false, s: false, d: false, space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let jumpQueued = false;
let ballCam = false;

document.addEventListener('keydown', (e) => {
    // Don't capture keys when typing in dev panel inputs
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') {
        if (!keys.space) jumpQueued = true;
        keys.space = true;
        e.preventDefault();
    }
    else if (e.key.toLowerCase() === 'y') {
        ballCam = !ballCam;
    }
    else if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
    else if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});
document.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') keys.space = false;
    else if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    else if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

let canJump = true;
world.addEventListener('postStep', () => {
    let wheelsTouching = 0;
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        if (vehicle.wheelInfos[i].isInContact) wheelsTouching++;
    }
    if (wheelsTouching > 0) {
        canJump = true;
    }
});

// --- Dev Panel ---
const devPanel = document.getElementById('dev-panel');
const devToggle = document.getElementById('dev-toggle');
const telemetryEl = document.getElementById('telemetry');

let devVisible = true;
devToggle.addEventListener('click', () => {
    devVisible = !devVisible;
    devPanel.classList.toggle('collapsed', !devVisible);
    devToggle.textContent = devVisible ? '▼ Dev Panel' : '▶ Dev Panel';
});

// Create slider helper
function createSlider(label, key, min, max, step, onChange) {
    const container = document.createElement('div');
    container.className = 'slider-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const valSpan = document.createElement('span');
    valSpan.className = 'slider-val';
    valSpan.textContent = tuning[key];

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = tuning[key];

    input.addEventListener('input', () => {
        tuning[key] = parseFloat(input.value);
        valSpan.textContent = tuning[key];
        if (onChange) onChange(tuning[key]);
    });

    container.appendChild(lbl);
    container.appendChild(input);
    container.appendChild(valSpan);
    document.getElementById('sliders').appendChild(container);
}

// Physics sliders
createSlider('Gravity', 'gravity', -120, -5, 1, (v) => { world.gravity.set(0, v, 0); });
createSlider('Engine Force', 'engineForce', 500, 30000, 500);
createSlider('Steer Angle', 'steerAngle', 0.1, 1.2, 0.01);
createSlider('Jump Impulse', 'jumpImpulse', 50, 30000, 50);
createSlider('Brake Force', 'brakeForce', 10, 1000, 10);
createSlider('Suspension Stiffness', 'suspensionStiffness', 5, 120, 1, (v) => {
    vehicle.wheelInfos.forEach(w => w.suspensionStiffness = v);
});
createSlider('Suspension Rest', 'suspensionRest', 0.1, 3.0, 0.1, (v) => {
    vehicle.wheelInfos.forEach(w => w.suspensionRestLength = v);
});
createSlider('Friction Slip', 'frictionSlip', 0.5, 20, 0.5, (v) => {
    vehicle.wheelInfos.forEach(w => w.frictionSlip = v);
});
createSlider('Roll Influence', 'rollInfluence', 0.0, 1.0, 0.05, (v) => {
    vehicle.wheelInfos.forEach(w => w.rollInfluence = v);
});
createSlider('Air Pitch Torque', 'airPitchTorque', 500, 20000, 500);
createSlider('Air Yaw Torque', 'airYawTorque', 500, 20000, 500);
createSlider('Camera Height', 'cameraHeight', 3, 30, 1);
createSlider('Camera Distance', 'cameraDist', 5, 60, 1);
createSlider('Camera Smoothing', 'cameraSmoothing', 0.01, 0.3, 0.01);

// Reset button
document.getElementById('reset-btn').addEventListener('click', () => {
    resetPositions();
});

// --- Main Loop ---
const clock = new THREE.Clock();
let fps = 0;
let frameCount = 0;
let fpsTime = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    // FPS counter
    frameCount++;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
        fps = Math.round(frameCount / fpsTime);
        frameCount = 0;
        fpsTime = 0;
    }

    // Apply Car Inputs
    // cannon-es RaycastVehicle wheel forward = cross(axle, dir) = (0,0,-1)
    // So NEGATIVE engineForce drives the car in +Z (toward green front face)
    const forward = (keys.w || keys.ArrowUp) ? -1 : (keys.s || keys.ArrowDown) ? 1 : 0;
    const steer = (keys.a || keys.ArrowLeft) ? 1 : (keys.d || keys.ArrowRight) ? -1 : 0;

    // Air Control
    if (!canJump) {
        const pitch = (keys.w || keys.ArrowUp) ? 1 : (keys.s || keys.ArrowDown) ? -1 : 0;

        if (pitch !== 0) {
            const pitchTorque = new CANNON.Vec3(pitch * tuning.airPitchTorque, 0, 0);
            const worldPitchTorque = new CANNON.Vec3();
            chassisBody.quaternion.vmult(pitchTorque, worldPitchTorque);
            chassisBody.applyTorque(worldPitchTorque);
        }

        if (steer !== 0) {
            const yawTorque = new CANNON.Vec3(0, steer * tuning.airYawTorque, 0);
            const worldYawTorque = new CANNON.Vec3();
            chassisBody.quaternion.vmult(yawTorque, worldYawTorque);
            chassisBody.applyTorque(worldYawTorque);
        }
    }

    // Engine & Steering
    vehicle.applyEngineForce(forward * tuning.engineForce, 2);
    vehicle.applyEngineForce(forward * tuning.engineForce, 3);

    vehicle.setSteeringValue(steer * tuning.steerAngle, 0);
    vehicle.setSteeringValue(steer * tuning.steerAngle, 1);

    // Braking
    if (keys.space && canJump && forward === 0 && steer === 0) {
        vehicle.setBrake(tuning.brakeForce, 0);
        vehicle.setBrake(tuning.brakeForce, 1);
        vehicle.setBrake(tuning.brakeForce, 2);
        vehicle.setBrake(tuning.brakeForce, 3);
    } else {
        vehicle.setBrake(0, 0);
        vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 2);
        vehicle.setBrake(0, 3);
    }

    if (jumpQueued && canJump) {
        // BUG FIX: Use local origin (0,0,0) as the contact point, NOT chassisBody.position
        // applyImpulse expects a world-space point OR you can use the overload with local point
        // Using CANNON.Vec3(0,1,0) scaled by impulse, applied at the body's center of mass
        const localUp = new CANNON.Vec3(0, 1, 0);
        const worldUp = new CANNON.Vec3();
        chassisBody.quaternion.vmult(localUp, worldUp);

        const impulse = worldUp.scale(tuning.jumpImpulse);
        chassisBody.applyImpulse(impulse, new CANNON.Vec3(0, 0, 0));
        canJump = false;
    }
    jumpQueued = false;

    // Step physics
    world.step(1 / 60, delta, 3);

    // Sync Visuals
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);

    carGroup.position.copy(chassisBody.position);
    carGroup.quaternion.copy(chassisBody.quaternion);

    // Sync Wheels
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const t = vehicle.wheelInfos[i].worldTransform;
        wheelMeshes[i].position.copy(t.position);
        wheelMeshes[i].quaternion.copy(t.quaternion);
    }

    // Dynamic Camera Follow
    // Camera sits BEHIND the car (negative Z local = behind the green front face)
    const relativeCameraOffset = new THREE.Vector3(0, tuning.cameraHeight, -tuning.cameraDist);
    const cameraOffset = relativeCameraOffset.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(carGroup.quaternion));

    camera.position.lerp(new THREE.Vector3(
        carGroup.position.x + cameraOffset.x,
        carGroup.position.y + cameraOffset.y,
        carGroup.position.z + cameraOffset.z
    ), tuning.cameraSmoothing);

    let lookAtPos;
    if (ballCam) {
        // Ball cam: always look at the ball
        lookAtPos = new THREE.Vector3().copy(ballMesh.position);
    } else {
        // Car cam: look ahead of the car, blend toward ball when close
        lookAtPos = new THREE.Vector3(carGroup.position.x, carGroup.position.y + 4, carGroup.position.z);
        const distToBall = carGroup.position.distanceTo(ballMesh.position);
        if (distToBall < 60) {
            lookAtPos.lerp(ballMesh.position, 1 - (distToBall / 60));
        }
    }

    camera.lookAt(lookAtPos);

    // Telemetry
    const speed = chassisBody.velocity.length();
    const vel = chassisBody.velocity;
    const pos = chassisBody.position;
    const wInfo = vehicle.wheelInfos;
    const wheelsInContact = wInfo.filter(w => w.isInContact).length;
    telemetryEl.innerHTML = `
        <strong>FPS:</strong> ${fps} | <strong>Speed:</strong> ${speed.toFixed(1)}<br>
        <strong>Vel:</strong> ${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)}<br>
        <strong>Pos:</strong> ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>
        <strong>Wheels on ground:</strong> ${wheelsInContact}/4<br>
        <strong>Engine input:</strong> ${forward} (force: ${(forward * tuning.engineForce).toFixed(0)})<br>
        <strong>Steer input:</strong> ${steer}<br>
        <strong>Ball Cam:</strong> ${ballCam ? 'ON' : 'OFF'} <em>(Y)</em>
    `;

    renderer.render(scene, camera);
}

resetPositions();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
