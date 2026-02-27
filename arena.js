import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CollisionGroups, materials } from './physics.js';

export function createArena(world, scene, config) {
    const { arenaWidth, arenaLength, wallHeight } = config;

    // --- Floor ---
    const floorGeo = new THREE.PlaneGeometry(arenaWidth, arenaLength);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x080812, roughness: 0.1, metalness: 0.8
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Synthwave grid
    const gridHelper = new THREE.GridHelper(Math.max(arenaWidth, arenaLength), 40, 0x00d2ff, 0xff00ff);
    gridHelper.position.y = 0.1;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Floor physics — thick box (top surface at y=0)
    const floorShape = new CANNON.Box(new CANNON.Vec3(arenaWidth / 2, 0.5, arenaLength / 2));
    const floorBody = new CANNON.Body({ mass: 0, material: materials.floor });
    floorBody.addShape(floorShape);
    floorBody.position.set(0, -0.5, 0);
    floorBody.collisionFilterGroup = CollisionGroups.FLOOR;
    floorBody.collisionFilterMask = CollisionGroups.ALL;
    world.addBody(floorBody);

    // --- Walls ---
    const wallGeoFront = new THREE.BoxGeometry(arenaWidth, wallHeight, 2);
    const wallGeoSide = new THREE.BoxGeometry(2, wallHeight, arenaLength);
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x111122, transmission: 0.5, opacity: 0.6, transparent: true,
        roughness: 0.1, metalness: 0.9, side: THREE.DoubleSide
    });

    const addWall = (geo, x, z, shapeVec, ry = 0) => {
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(x, wallHeight / 2, z);
        mesh.rotation.y = ry;
        scene.add(mesh);

        const body = new CANNON.Body({ mass: 0, material: materials.wall });
        body.addShape(new CANNON.Box(shapeVec));
        body.position.set(x, wallHeight / 2, z);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
        body.collisionFilterGroup = CollisionGroups.WALL;
        body.collisionFilterMask = CollisionGroups.ALL;
        world.addBody(body);
    };

    addWall(wallGeoSide, arenaWidth / 2, 0, new CANNON.Vec3(1, wallHeight / 2, arenaLength / 2));
    addWall(wallGeoSide, -arenaWidth / 2, 0, new CANNON.Vec3(1, wallHeight / 2, arenaLength / 2));
    addWall(wallGeoFront, 0, arenaLength / 2, new CANNON.Vec3(arenaWidth / 2, wallHeight / 2, 1));
    addWall(wallGeoFront, 0, -arenaLength / 2, new CANNON.Vec3(arenaWidth / 2, wallHeight / 2, 1));

    // --- Goals ---
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
        sensorBody.collisionFilterGroup = CollisionGroups.GOAL;
        sensorBody.collisionFilterMask = CollisionGroups.BALL;
        world.addBody(sensorBody);

        return sensorBody;
    };

    const blueGoalSensor = createGoal(true);
    const orangeGoalSensor = createGoal(false);

    return { blueGoalSensor, orangeGoalSensor };
}
