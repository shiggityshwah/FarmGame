// Centralized game configuration constants
// Extracted from various files to enable easy balancing and adjustment

export const CONFIG = {
    // === PLAYER STATS ===
    player: {
        maxHealth: 100,
        damage: 10,
        moveSpeed: 80,              // pixels per second
        visionRange: 5,             // tiles
        attackRange: 1,             // tiles (must be adjacent)
        attackCooldown: 800,        // ms between attacks
        damageFlashDuration: 200    // ms
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
            fadeDuration: 1500      // ms after death
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
        holeOverlay: 1138
    },

    // === PATHFINDING ===
    pathfinding: {
        maxIterations: 1000         // prevent infinite loops
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
