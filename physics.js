import * as CANNON from 'cannon-es';

// --- Collision Categories (bitmask) ---
export const CollisionGroups = {
    FLOOR:     0x0001,
    CHASSIS:   0x0002,
    BALL:      0x0004,
    WALL:      0x0008,
    GOAL:      0x0010,
    // Reserved for future:
    // BOOST_PAD: 0x0020,
    // RAMP:      0x0040,
    // DEBRIS:    0x0080,
    ALL:       0xFFFF,
};

// --- Contact Material Registry ---
export const materials = {};

const contactDefs = [
    ['car',   'ball',  { friction: 0.5,  restitution: 1.2 }],
    ['car',   'floor', { friction: 0.05, restitution: 0.0 }],
    ['car',   'wall',  { friction: 0.1,  restitution: 0.2 }],
    ['ball',  'floor', { friction: 0.2,  restitution: 0.8 }],
    ['ball',  'wall',  { friction: 0.2,  restitution: 0.8 }],
];

function registerContacts(world, defs) {
    for (const [a, b, props] of defs) {
        materials[a] ??= new CANNON.Material(a);
        materials[b] ??= new CANNON.Material(b);
        world.addContactMaterial(new CANNON.ContactMaterial(materials[a], materials[b], props));
    }
}

// --- World Factory ---
export function createPhysicsWorld(tuning) {
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, tuning.gravity, 0),
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    registerContacts(world, contactDefs);
    return world;
}
