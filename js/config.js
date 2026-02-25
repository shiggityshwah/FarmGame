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
        grass: [65, 66, 129, 130, 131, 132, 133, 134, 192, 193, 194, 195, 197, 199, 257, 258],
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
    },

    // === CHUNK SYSTEM ===
    chunks: {
        size: 30,               // Tiles per chunk side
        initialGridCols: 3,     // Initial grid width in chunks (3 × 30 = 90 tiles)
        initialGridRows: 4,     // Initial grid height in chunks (4 × 30 = 120 tiles + 4 path gap = 124 total)
        townCol: 1,             // Town chunk column index (within 0-2 range)
        townRow: 1,             // Town chunk row index (within 0-3 range) → x=30-59, y=30-59
        farmCol: 1,             // Farm chunk column index (within 0-2 range)
        farmRow: 2,             // Farm chunk row index → x=30-59, world y=64-93 (after 4-tile great path gap)
        mainPathY: 60,          // World Y of the great path strip top row (y=60 N-grass, y=61-62 path, y=63 S-grass)
        mainPathGap: 4          // Number of world tile rows reserved for the great path (between townRow and farmRow)
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
