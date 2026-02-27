import * as THREE from 'three';
import { createPhysicsWorld } from './physics.js';
import { Ball, Vehicle } from './entities.js';
import { createArena } from './arena.js';

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

const spotLight1 = new THREE.SpotLight(0x00ffff, 1000);
spotLight1.position.set(-60, 20, 0);
spotLight1.lookAt(0, 0, 0);
scene.add(spotLight1);

const spotLight2 = new THREE.SpotLight(0xff00ff, 1000);
spotLight2.position.set(60, 20, 0);
spotLight2.lookAt(0, 0, 0);
scene.add(spotLight2);

// --- Physics World ---
const world = createPhysicsWorld(tuning);

// --- Arena ---
const arenaConfig = { arenaWidth: 100, arenaLength: 160, wallHeight: 40 };
const { blueGoalSensor, orangeGoalSensor } = createArena(world, scene, arenaConfig);

// --- Entities ---
const entities = [];

const ball = new Ball(tuning);
ball.addToWorld(world, scene);
entities.push(ball);

const car = new Vehicle(scene, tuning);
car.addToWorld(world, scene);
entities.push(car);

// --- Scoring ---
let blueScore = 0;
let orangeScore = 0;
const scoreElement = document.getElementById('score');

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
    if (event.bodyA === ball.body || event.bodyB === ball.body) {
        const other = event.bodyA === ball.body ? event.bodyB : event.bodyA;
        if (other === blueGoalSensor) scorePoint('orange');
        else if (other === orangeGoalSensor) scorePoint('blue');
    }
});

const resetPositions = () => {
    ball.reset();
    car.reset();
};

// --- Input Controls ---
const keys = { w: false, a: false, s: false, d: false, space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let jumpQueued = false;
let ballCam = false;

document.addEventListener('keydown', (e) => {
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

createSlider('Gravity', 'gravity', -120, -5, 1, (v) => { world.gravity.set(0, v, 0); });
createSlider('Engine Force', 'engineForce', 500, 30000, 500);
createSlider('Steer Angle', 'steerAngle', 0.1, 1.2, 0.01);
createSlider('Jump Impulse', 'jumpImpulse', 50, 30000, 50);
createSlider('Brake Force', 'brakeForce', 10, 1000, 10);
createSlider('Suspension Stiffness', 'suspensionStiffness', 5, 120, 1, (v) => {
    car.vehicle.wheelInfos.forEach(w => w.suspensionStiffness = v);
});
createSlider('Suspension Rest', 'suspensionRest', 0.1, 3.0, 0.1, (v) => {
    car.vehicle.wheelInfos.forEach(w => w.suspensionRestLength = v);
});
createSlider('Friction Slip', 'frictionSlip', 0.5, 20, 0.5, (v) => {
    car.vehicle.wheelInfos.forEach(w => w.frictionSlip = v);
});
createSlider('Roll Influence', 'rollInfluence', 0.0, 1.0, 0.05, (v) => {
    car.vehicle.wheelInfos.forEach(w => w.rollInfluence = v);
});
createSlider('Air Pitch Torque', 'airPitchTorque', 500, 20000, 500);
createSlider('Air Yaw Torque', 'airYawTorque', 500, 20000, 500);
createSlider('Camera Height', 'cameraHeight', 3, 30, 1);
createSlider('Camera Distance', 'cameraDist', 5, 60, 1);
createSlider('Camera Smoothing', 'cameraSmoothing', 0.01, 0.3, 0.01);

document.getElementById('reset-btn').addEventListener('click', () => {
    resetPositions();
});

// --- Game Loop Phases ---
const clock = new THREE.Clock();
let fps = 0;
let frameCount = 0;
let fpsTime = 0;

function updateFPS(delta) {
    frameCount++;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
        fps = Math.round(frameCount / fpsTime);
        frameCount = 0;
        fpsTime = 0;
    }
}

function processInput() {
    const forward = (keys.w || keys.ArrowUp) ? -1 : (keys.s || keys.ArrowDown) ? 1 : 0;
    const steer = (keys.a || keys.ArrowLeft) ? 1 : (keys.d || keys.ArrowRight) ? -1 : 0;
    return { forward, steer };
}

function applyVehiclePhysics({ forward, steer }) {
    // Air control when airborne
    if (!car.canJump) {
        const pitch = (keys.w || keys.ArrowUp) ? 1 : (keys.s || keys.ArrowDown) ? -1 : 0;
        car.applyAirControl(pitch, steer);
    }

    car.applyInput(forward, steer);
    car.applyBrake(keys.space && car.canJump && forward === 0 && steer === 0);

    if (jumpQueued) {
        car.jump();
    }
    jumpQueued = false;
}

function syncVisuals() {
    entities.forEach(e => e.sync());
    car.syncWheels();
}

function updateCamera() {
    const relativeCameraOffset = new THREE.Vector3(0, tuning.cameraHeight, -tuning.cameraDist);
    const cameraOffset = relativeCameraOffset.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(car.mesh.quaternion));

    camera.position.lerp(new THREE.Vector3(
        car.mesh.position.x + cameraOffset.x,
        car.mesh.position.y + cameraOffset.y,
        car.mesh.position.z + cameraOffset.z
    ), tuning.cameraSmoothing);

    let lookAtPos;
    if (ballCam) {
        lookAtPos = new THREE.Vector3().copy(ball.mesh.position);
    } else {
        lookAtPos = new THREE.Vector3(car.mesh.position.x, car.mesh.position.y + 4, car.mesh.position.z);
        const distToBall = car.mesh.position.distanceTo(ball.mesh.position);
        if (distToBall < 60) {
            lookAtPos.lerp(ball.mesh.position, 1 - (distToBall / 60));
        }
    }

    camera.lookAt(lookAtPos);
}

function updateTelemetry(forward, steer) {
    const speed = car.body.velocity.length();
    const vel = car.body.velocity;
    const pos = car.body.position;
    telemetryEl.innerHTML = `
        <strong>FPS:</strong> ${fps} | <strong>Speed:</strong> ${speed.toFixed(1)}<br>
        <strong>Vel:</strong> ${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)}<br>
        <strong>Pos:</strong> ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>
        <strong>Wheels on ground:</strong> ${car.wheelContactCount}/4<br>
        <strong>Engine input:</strong> ${forward} (force: ${(forward * tuning.engineForce).toFixed(0)})<br>
        <strong>Steer input:</strong> ${steer}<br>
        <strong>Ball Cam:</strong> ${ballCam ? 'ON' : 'OFF'} <em>(Y)</em>
    `;
}

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    updateFPS(delta);
    const input = processInput();
    applyVehiclePhysics(input);
    world.step(1 / 60, delta, 3);
    // Wheel contacts already captured in postStep listener (before syncWheels resets them)
    syncVisuals();
    updateCamera();
    updateTelemetry(input.forward, input.steer);
    renderer.render(scene, camera);
}

resetPositions();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
