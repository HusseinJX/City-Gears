// Tunable constants for the City Walk game.
// All distances in world units, times in seconds, angles in radians.

export const CONFIG = {
  // Movement
  walkSpeed: 6.0,
  sprintMultiplier: 1.8,
  turnLerp: 12.0,             // how fast the character rotates to face movement
  movementDeadzone: 0.001,

  // Camera
  camera: {
    fov: 60,
    near: 0.1,
    far: 400,
    distance: 7.0,
    height: 3.2,
    lookHeight: 1.4,
    positionLerp: 8.0,        // higher = snappier
    targetLerp: 10.0,
    minPitch: -1.2,
    maxPitch: 0.9,
    mouseSensitivity: 0.0025,
    minDistance: 1.6,         // when blocked by buildings
  },

  // City layout — non-uniform procedural street grid with mixed block types
  city: {
    extent: 360,               // target side length of the city area
    minBlockSize: 22,          // smallest block dimension
    maxBlockSize: 56,          // largest block dimension
    roadWidth: 9,              // street width between blocks
    sidewalkWidth: 2.2,
    sidewalkHeight: 0.18,
    minBuildingsPerBlock: 3,
    maxBuildingsPerBlock: 9,
    minBuildingHeight: 4,
    maxBuildingHeight: 52,
    buildingMargin: 0.6,
    // Block-type probabilities (fall through to 'mixed')
    towerChance: 0.09,
    parkChance: 0.12,
    restaurantChance: 0.26,
    // Legacy — some older code references blocks/blockSize; kept for compat.
    blocks: 11,
    blockSize: 30,
  },

  // Props (scattered)
  props: {
    trees: 80,
    streetlights: 90,
    benches: 60,
    trashCans: 60,
    fireHydrants: 60,
    parkedCars: 80,
  },

  // Environment
  fogDensity: 0.012,
  skyTopColor: 0x6cb8ff,
  skyHorizonColor: 0xffd8a8,
  ambientColor: 0xb8c8d8,
  ambientIntensity: 0.55,
  sunColor: 0xfff2d6,
  sunIntensity: 1.05,
  groundColor: 0x4a7a3a,

  // Building palette (cartoon-ish)
  buildingColors: [
    0xe8c39e, 0xc77f5a, 0xa05a3c, 0xd9b67c,
    0xb8a787, 0x8a99a8, 0xc1b6d6, 0xf0d49a,
    0xd0a070, 0x9bb0c4, 0xc8a890, 0xb87e6e,
    0xeacf8a, 0x7c8da0, 0xb59a78, 0xd6c0a8,
  ],
  roofColors: [
    0x6a4e3c, 0x4a3a30, 0x554839, 0x3f3a35,
  ],

  // Car colors
  carColors: [
    0xe24a4a, 0x4a8be2, 0xf2c14e, 0x4ec97a,
    0xb05ad5, 0xe88a3a, 0xf5f5f5, 0x2a2a2a,
    0xd45a8a, 0x57b6c2,
  ],

  // Character colors
  character: {
    skin: 0xf3c8a4,
    hair: 0x3a2a1a,
    shirt: 0x2a6fd8,
    pants: 0x2a2a3a,
    shoes: 0x1a1a1a,
    eyes: 0x1a1a1a,
    mouth: 0x8a3a3a,
    height: 1.8,
    walkBobAmplitude: 0.05,
    walkArmAmplitude: 0.9,
    walkLegAmplitude: 0.9,
    walkFrequency: 1.6,        // radians per unit walked
    breathingFrequency: 1.6,   // radians per second
    breathingAmplitude: 0.04,
    // Jump physics
    jumpVelocity: 7.5,
    gravity: 22.0,
    stepLength: 1.35,          // distance walked between footstep sounds
  },

  // Restaurants (placed on 'restaurant' blocks — storefronts with awnings)
  restaurants: {
    names: [
      "Luigi's Pizzeria", "Osaka Bowl", "Kebab King", "Taco Central",
      "The Green Table", "Saigon Noodles", "Hanoi Street", "Pizza Joe",
      "Burger Barn", "Blue Lagoon Sushi", "Caffè Roma", "The Brown Bear",
      "Spice Route", "Mama's Diner", "Ramen Ichi", "Le Petit Bistro",
      "Fire & Dough", "The Loft Cafe", "Gyro Palace", "Tandoori Nights",
    ],
    awningColors: [
      0xd83a3a, 0x3a6ad8, 0x5ac26a, 0xe8a83a,
      0xe15a8a, 0x2fa8c0, 0x8f6ad0, 0xf0cc6a,
    ],
  },

  // NPC pedestrians wandering the sidewalks
  npcs: {
    pedestrians: 120,
    speedMin: 1.6,
    speedMax: 2.8,
    colors: [
      0xd85a5a, 0x5a8ad8, 0x6a6a6a, 0x5ad88a, 0xd8c05a, 0xa85ad8,
      0xd8885a, 0x5ad8d8, 0x8a5ad8, 0xc0c0c0, 0xff8a8a, 0x6acb9a,
    ],
  },

  // Shops and interaction
  shops: {
    count: 18,
    signColors: [0xd83a3a, 0x3a8ad8, 0x5ac26a, 0xd8a83a, 0xa83ad8, 0x1f7a8c],
    names: [
      "Corner Market", "Tony's Pizza", "Blue Note Cafe", "Pixel Books",
      "Rust Hardware", "Moon Bakery", "Urban Threads", "Green Leaf Florist",
      "Arcade Street", "Sunrise Diner", "Corner Bar", "Vinyl Vault",
      "Downtown Electronics", "Sunset Coffee", "Steel City Gym",
      "Paper Plane Toys", "Blueberry Juice", "Moonlight Cinema",
    ],
    dialog: [
      "Hey there, welcome in! Let me know if you need anything.",
      "Fresh batch just came out of the oven!",
      "You're my first customer today. Take your time.",
      "Rain's coming later, I can feel it.",
      "We've got a sale this week — 20% off everything.",
      "Careful out there, the traffic's been wild today.",
      "Nice day for a walk, isn't it?",
      "That new place across the street? Overrated if you ask me.",
      "I've been running this shop for thirty years, friend.",
      "Coffee's on the house for first-timers.",
    ],
  },

  interaction: {
    radius: 3.5,
  },

  // Motorcycle physics + cosmetics — RPM-based drivetrain model
  // (following Marco Monster's "Car Physics for Games" conventions:
  //  rpm = wheelRotRate * gearRatio * finalDrive * 60 / (2π);
  //  driveForce = engineTorque(rpm) * gearRatio * finalDrive / wheelRadius)
  //
  // Each gear has only a ratio. Top speed per gear emerges naturally from the
  // redline rpm and ratio — no separate cap needed. Low gears multiply torque
  // heavily so they accelerate hard but hit redline fast. High gears barely
  // produce torque at low rpm, so staying in 6th from a stop crawls and can
  // stall. Stall is only enabled in gears 4-6 (arcade concession).
  motorcycle: {
    frameColor: 0xd83a3a,
    tankColor: 0x8a1f1f,

    // Engine parameters
    // engineTorque is the acceleration scale (combines peak torque, final drive,
    // efficiency, wheel radius, and mass into a single tuned number so accel =
    // engineTorque * torqueCurve(rpm) * gearRatio produces realistic acceleration).
    engineTorque: 3.2,         // tuned so each gear takes ~2.5s WOT to reach redline
    idleRpm: 1400,
    stallRpm: 900,             // below this = stall (in stall-enabled gears)
    peakTorqueRpm: 6500,
    peakPowerRpm: 9500,
    redlineRpm: 12000,
    shiftLightRpm: 11000,      // HUD shift-up warning (fires only when actually near redline)
    lugWarnRpm: 2200,          // HUD "downshift" warning (engine is lugging)
    stallGearMin: 4,           // gears >= this can stall when you bog them down
    engineInertia: 6.5,        // how fast rpm responds to load changes
    idleDecayRate: 2.0,        // how fast rpm returns to idle when coasting in neutral-ish
    restartRpm: 1600,          // rpm after restart

    // Drivetrain (per Marco Monster formulas). finalDriveRatio is tuned so
    // redline in 6th ≈ 62 units/s ≈ 223 "km/h" after HUD scaling.
    //   speedAtRedline = redlineRpm * wheelRadius * 2π / (60 * gearRatio * finalDrive)
    // With 0.42 wheel radius and 12000 redline: final = 9.9 gives
    //   g1≈18  g2≈27  g3≈37  g4≈45  g5≈53  g6≈62
    finalDriveRatio: 9.9,
    wheelRadius: 0.42,
    driveEfficiency: 0.88,     // n in Fdrive = T * xg * xd * n / Rw

    // Torque curve — [rpm, normalizedTorque 0..1]. Linear interpolation.
    // Peak at 6500 rpm, tapers past 9500, limiter past redline.
    torqueCurve: [
      [500,   0.00],
      [900,   0.15],
      [1400,  0.40],
      [2500,  0.62],
      [4000,  0.82],
      [5500,  0.94],
      [6500,  1.00],
      [7500,  0.98],
      [8500,  0.93],
      [9500,  0.85],
      [10500, 0.72],
      [12000, 0.45],
      [12500, 0.00],
    ],

    // Sportbike-style ratios (1st big, 6th overdrive). With finalDrive 2.6,
    // wheelRadius 0.42, redline 12000 → top speeds ≈
    //   g1 ≈ 13  g2 ≈ 19  g3 ≈ 26  g4 ≈ 32  g5 ≈ 38  g6 ≈ 45
    gearRatios:       [2.85, 1.95, 1.45, 1.18, 1.00, 0.86],
    reverseGearRatio: -2.50,   // used when state.gear === 7

    // Braking + arcade auto-reverse (still keep arcade feel on S-without-7)
    brakeAccel: 20.0,          // S applied while moving forward = strong brake
    autoReverseAccel: 3.4,     // S at standstill trickles into reverse
    autoReverseMaxSpeed: 3.0,
    coastDrag: 0.35,           // very mild — engine braking dominates

    boostMultiplier: 1.45,     // shift-to-boost extra torque
    turnRate: 1.9,             // radians/s at full speed
    steerResponse: 6.0,
    cameraFollowLerp: 3.0,
    collisionRadius: 0.55,
    mountDistance: 4.0,
    seatHeight: 0.85,
    shiftRpmBlipDuration: 0.18,

    // Legacy aliases still referenced by old code paths (camera, HUD, etc).
    accel: 7.5,
    boostAccel: 12.0,
    maxSpeed: 20.0,
    boostMaxSpeed: 45.0,
    maxReverseSpeed: 7.0,
    // Derived top-speed hints (used by engine audio normalization if needed).
    gearTopSpeeds: [13, 19, 26, 32, 38, 45],
  },

  // Car — same drivetrain as motorcycle, different visuals + sizing.
  car: {
    bodyColor: 0x3a6ad8,
    cabinColor: 0x1f3a6a,

    // --- drivetrain (mirrors motorcycle exactly) ---
    engineTorque: 3.2,
    idleRpm: 1400, stallRpm: 900, peakTorqueRpm: 6500, peakPowerRpm: 9500,
    redlineRpm: 12000, shiftLightRpm: 11000, lugWarnRpm: 2200,
    stallGearMin: 4, engineInertia: 6.5, idleDecayRate: 2.0, restartRpm: 1600,
    finalDriveRatio: 9.9, wheelRadius: 0.42, driveEfficiency: 0.88,
    torqueCurve: [
      [500,   0.00], [900,   0.15], [1400,  0.40], [2500,  0.62],
      [4000,  0.82], [5500,  0.94], [6500,  1.00], [7500,  0.98],
      [8500,  0.93], [9500,  0.85], [10500, 0.72], [12000, 0.45],
      [12500, 0.00],
    ],
    gearRatios: [2.85, 1.95, 1.45, 1.18, 1.00, 0.86],
    reverseGearRatio: -2.50,
    brakeAccel: 20.0, autoReverseAccel: 3.4, autoReverseMaxSpeed: 3.0, coastDrag: 0.35,
    boostMultiplier: 1.45, turnRate: 1.9, steerResponse: 6.0,

    // --- car-specific sizing / cosmetics ---
    cameraFollowLerp: 3.0,
    collisionRadius: 1.2,
    mountDistance: 5.0,
    seatHeight: 1.15,
    maxSpeed: 20.0,
    maxReverseSpeed: 7.0,
  },
};
