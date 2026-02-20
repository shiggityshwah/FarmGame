// Centralized game configuration constants
// Extracted from various files to enable easy balancing and adjustment

export const CONFIG = {
    // === DEBUG ===
    debug: {
        logLevel: 'info',           // 'debug', 'info', 'warn', 'error', 'none'
        showFps: false,             // Show FPS counter
        showPathfinding: false      // Visualize pathfinding
    },

    // === PLAYER STATS ===
    player: {
        maxHealth: 100,
        damage: 10,
        moveSpeed: 80,              // pixels per second
        visionRange: 5,             // tiles
        attackRange: 1,             // tiles (must be adjacent)
        attackCooldown: 800,        // ms between attacks
        damageFlashDuration: 200,   // ms
        healthRegen: 1,             // HP per second (when out of combat)
        healthRegenDelay: 3000      // ms after taking damage before regen starts
    },

    // === GOBLIN STATS ===
    goblin: {
        maxHealth: 80,
        healthRegen: 0.5,           // HP per second (slower than player)
        healthRegenDelay: 5000      // ms after taking damage before regen starts
    },

    // === ENEMY STATS ===
    enemy: {
        skeleton: {
            maxHealth: 30,
            damage: 5,
            moveSpeed: 40,          // pixels per second
            visionRange: 5,         // tiles
            attackRange: 1,         // tiles
            attackCooldown: 1000,   // ms
            fadeDuration: 1500,     // ms after death
            pathfindCooldown: 500,  // ms between path recalculations
            damageFlashDuration: 200 // ms for damage flash effect
        }
    },

    // === CAMERA ===
    camera: {
        minZoom: 0.5,
        maxZoom: 4.0,
        panSpeed: 300               // pixels per second
    },

    // === INPUT ===
    input: {
        clickThreshold: 5,          // pixels - movement beyond this is a drag
        panSpeed: 300               // pixels per second
    },

    // === ANIMATION ===
    animation: {
        defaultFps: 8
    },

    // === MOVEMENT ===
    movement: {
        waypointThreshold: 2        // pixels - distance to consider waypoint reached
    },

    // === PATH SYSTEM ===
    path: {
        speedMultiplier: 1.5        // 1.5x speed on path tiles (pathfinding cost derived as 1/speedMultiplier)
    },

    // === RESOURCE FADE ===
    resourceFade: {
        duration: 500               // ms for resources to fade out after depletion
    },

    // === CROPS ===
    crops: {
        growthTime: 3000,           // ms per growth stage
        harvestFadeTime: 500        // ms for harvest effect
    },

    // === FLOWERS & WEEDS ===
    flowers: {
        spawnChance: 0.25,          // 25% flower vs 75% weed
        rarityBlue: 0.10,           // 10% blue
        rarityRed: 0.30,            // 30% red
        rarityWhite: 0.60,          // 60% white
        harvestYieldMin: 1,
        harvestYieldMax: 2
    },
    weeds: {
        growthTime: 30000,          // ms per growth stage (2 min total for 4 stages)
        maxStage: 4
    },

    // === TREES ===
    trees: {
        thin: {
            width: 1,
            height: 3,
            minWood: 2,
            maxWood: 5
        },
        thick: {
            width: 2,
            height: 3,
            minWood: 5,
            maxWood: 10
        }
    },

    // === ORE VEINS ===
    ores: {
        width: 2,
        height: 2,
        minOre: 5,
        maxOre: 10
    },

    // === RENDERING ===
    rendering: {
        tileSize: 16,
        healthBarWidth: 32,
        healthBarHeight: 5,
        healthBarOffset: 24        // pixels above sprite
    },

    // === UI ===
    ui: {
        iconScale: 4.0              // toolbar icon scale (400%)
    },

    // === TILE IDS ===
    // Common tiles used for game logic
    tiles: {
        hoedGround: [67, 449, 457, 458, 459, 521, 522],
        holeOverlay: 1138,
        path: [482, 490, 491, 554, 555],
        pathEdgeOverlays: {
            'N': 550, 'E': 487, 'S': 485, 'W': 548,
            'N+E': 486, 'N+W': 546, 'E+S': 483, 'W+S': 484
        }
    },

    // === PATHFINDING ===
    pathfinding: {
        maxIterations: 5000         // prevent infinite loops (increased for larger grids with path tiles)
    },

    // === FOREST POCKETS ===
    forestPockets: {
        enemySpawnChance: 0.4,      // 40% chance for pocket to have skeletons
        minEnemiesPerPocket: 1,
        maxEnemiesPerPocket: 3
    }
};

// Dirt tile selection helper
export function getRandomDirtTile() {
    const common = [67, 449];
    const rare = [457, 458, 459, 521, 522];

    if (Math.random() < 0.8) {
        return common[Math.floor(Math.random() * common.length)];
    }
    return rare[Math.floor(Math.random() * rare.length)];
}

// Path tile selection helper - 482 is most common
export function getRandomPathTile() {
    const rare = [490, 491, 554, 555];
    if (Math.random() < 0.6) {
        return 482;
    }
    return rare[Math.floor(Math.random() * rare.length)];
}
