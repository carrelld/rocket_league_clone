import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CollisionGroups, materials } from './physics.js';

// --- Base Entity ---
export class Entity {
    constructor(mesh, body) {
        this.mesh = mesh;
        this.body = body;
    }

    sync() {
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);
    }

    addToWorld(world, scene) {
        world.addBody(this.body);
        scene.add(this.mesh);
    }
}

// --- Ball ---
export class Ball extends Entity {
    constructor(tuning) {
        const radius = 3.5;

        // Visual
        const mesh = new THREE.Group();
        const outer = new THREE.Mesh(
            new THREE.IcosahedronGeometry(radius, 2),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.1, metalness: 0.9, wireframe: true })
        );
        const inner = new THREE.Mesh(
            new THREE.IcosahedronGeometry(radius - 0.2, 1),
            new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x444444 })
        );
        mesh.add(outer);
        mesh.add(inner);
        mesh.castShadow = true;
        mesh.add(new THREE.PointLight(0xffffff, 100, 30));

        // Physics
        const body = new CANNON.Body({ mass: tuning.ballMass, material: materials.ball });
        body.addShape(new CANNON.Sphere(radius));
        body.position.set(0, 15, 0);
        body.linearDamping = 0.1;
        body.angularDamping = 0.1;
        body.collisionFilterGroup = CollisionGroups.BALL;
        body.collisionFilterMask = CollisionGroups.FLOOR | CollisionGroups.CHASSIS
                                 | CollisionGroups.WALL | CollisionGroups.GOAL;

        super(mesh, body);
        this.radius = radius;
    }

    reset() {
        this.body.position.set(0, 15, 0);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
    }
}

// --- Vehicle ---
export class Vehicle extends Entity {
    constructor(scene, tuning) {
        const width = 4.5;
        const height = 2.5;
        const depth = 7;

        // Visual - car group
        const carGroup = new THREE.Group();

        const bodyMesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x002244, roughness: 0.3, metalness: 0.8 })
        );
        bodyMesh.position.y = height / 2;
        bodyMesh.castShadow = true;
        carGroup.add(bodyMesh);

        // Green front indicator — the FRONT of the car is +Z local
        const frontIndicator = new THREE.Mesh(
            new THREE.PlaneGeometry(width * 0.8, height * 0.6),
            new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.5 })
        );
        frontIndicator.position.set(0, height / 2, depth / 2 + 0.01);
        carGroup.add(frontIndicator);

        // Neon underglow
        const underlight = new THREE.PointLight(0x00d2ff, 150, 20);
        underlight.position.set(0, 1, 0);
        carGroup.add(underlight);

        // Physics chassis
        const chassisBody = new CANNON.Body({ mass: tuning.carMass, material: materials.car });
        chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
        chassisBody.position.set(0, 5, -50);
        chassisBody.angularDamping = 0.5;
        // Chassis collides with floor (safety net), ball, walls, goals
        chassisBody.collisionFilterGroup = CollisionGroups.CHASSIS;
        chassisBody.collisionFilterMask = CollisionGroups.FLOOR | CollisionGroups.BALL
                                        | CollisionGroups.WALL | CollisionGroups.GOAL;

        super(carGroup, chassisBody);

        this.tuning = tuning;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.canJump = true;
        this.wheelContactCount = 0;
        this.wheelContacts = [false, false, false, false];

        // RaycastVehicle
        this.vehicle = new CANNON.RaycastVehicle({ chassisBody });

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

        // Connection at chassis center — suspension rays extend downward
        this.vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, 0, distL) });
        this.vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, 0, distL) });
        this.vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-distW, 0, -distL) });
        this.vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(distW, 0, -distL) });

        // Wheel meshes (added to scene directly, not to carGroup)
        const wheelGeo = new THREE.CylinderGeometry(1.2, 1.2, 1, 32);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        this.wheelMeshes = [];
        for (let i = 0; i < 4; i++) {
            const wGroup = new THREE.Group();
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.rotation.z = Math.PI / 2;
            w.castShadow = true;
            wGroup.add(w);
            scene.add(wGroup);
            this.wheelMeshes.push(wGroup);
        }
    }

    addToWorld(world, scene) {
        // RaycastVehicle.addToWorld adds chassis body + preStep listener
        this.vehicle.addToWorld(world);
        scene.add(this.mesh);

        // Capture wheel contact state in postStep (after castRay sets isInContact,
        // before syncWheels resets it)
        world.addEventListener('postStep', () => {
            this.captureWheelContacts();
            this.canJump = this.wheelContactCount > 0;
        });
    }

    captureWheelContacts() {
        this.wheelContactCount = 0;
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const inContact = this.vehicle.wheelInfos[i].isInContact;
            this.wheelContacts[i] = inContact;
            if (inContact) this.wheelContactCount++;
        }
    }

    applyInput(forward, steer) {
        // cannon-es RaycastVehicle wheel forward = cross(axle, dir) = (0,0,-1)
        // So NEGATIVE engineForce drives the car in +Z (toward green front face)
        this.vehicle.applyEngineForce(forward * this.tuning.engineForce, 2);
        this.vehicle.applyEngineForce(forward * this.tuning.engineForce, 3);
        this.vehicle.setSteeringValue(steer * this.tuning.steerAngle, 0);
        this.vehicle.setSteeringValue(steer * this.tuning.steerAngle, 1);
    }

    applyBrake(active) {
        const force = active ? this.tuning.brakeForce : 0;
        for (let i = 0; i < 4; i++) this.vehicle.setBrake(force, i);
    }

    applyAirControl(pitch, yaw) {
        if (pitch !== 0) {
            const torque = new CANNON.Vec3(pitch * this.tuning.airPitchTorque, 0, 0);
            const worldTorque = new CANNON.Vec3();
            this.body.quaternion.vmult(torque, worldTorque);
            this.body.applyTorque(worldTorque);
        }
        if (yaw !== 0) {
            const torque = new CANNON.Vec3(0, yaw * this.tuning.airYawTorque, 0);
            const worldTorque = new CANNON.Vec3();
            this.body.quaternion.vmult(torque, worldTorque);
            this.body.applyTorque(worldTorque);
        }
    }

    jump() {
        if (!this.canJump) return false;
        const localUp = new CANNON.Vec3(0, 1, 0);
        const worldUp = new CANNON.Vec3();
        this.body.quaternion.vmult(localUp, worldUp);
        this.body.applyImpulse(worldUp.scale(this.tuning.jumpImpulse), new CANNON.Vec3(0, 0, 0));
        this.canJump = false;
        return true;
    }

    syncWheels() {
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.updateWheelTransform(i);
            const t = this.vehicle.wheelInfos[i].worldTransform;
            this.wheelMeshes[i].position.copy(t.position);
            this.wheelMeshes[i].quaternion.copy(t.quaternion);
        }
    }

    reset() {
        this.body.position.set(0, 5, -50);
        this.body.quaternion.set(0, 0, 0, 1);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
    }
}
