// Ore vein types with their tile IDs
// Each ore has 4 tiles arranged in a 2x2 grid (top-left, top-right, bottom-left, bottom-right)
// Each stage: full -> partially mined -> well mined -> depleted
export const ORE_TYPES = {
    IRON: {
        name: 'Iron',
        stages: {
            full: [1393, 1394, 1457, 1458],
            partial: [1395, 1396, 1459, 1460],
            depleted: [1397, 1398, 1461, 1462]
        },
        iconTileId: 1463,
        hitsPerStage: 1
    },
    COAL: {
        name: 'Coal',
        stages: {
            full: [1521, 1522, 1585, 1586],
            partial: [1523, 1524, 1587, 1588],
            depleted: [1525, 1526, 1589, 1590]
        },
        iconTileId: 1591,
        hitsPerStage: 1
    },
    MITHRIL: {
        name: 'Mithril',
        stages: {
            full: [1649, 1650, 1713, 1714],
            partial: [1651, 1652, 1715, 1716],
            depleted: [1653, 1654, 1717, 1718]
        },
        iconTileId: 1719,
        hitsPerStage: 1
    },
    GOLD: {
        name: 'Gold',
        stages: {
            full: [1777, 1778, 1841, 1842],
            partial: [1779, 1780, 1843, 1844],
            depleted: [1781, 1782, 1845, 1846]
        },
        iconTileId: 1847,
        hitsPerStage: 1
    },
    ROCK: {
        name: 'Rock',
        stages: {
            full: [1905, 1906, 1969, 1970],
            partial: [1907, 1908, 1971, 1972],
            depleted: [1909, 1910, 1973, 1974]
        },
        iconTileId: 1975,
        hitsPerStage: 1
    }
};

// Mining stages
export const MINING_STAGE = {
    FULL: 0,
    PARTIAL: 1,
    DEPLETED: 2,
    GONE: 3
};

export class OreVein {
    constructor(tileX, tileY, oreType) {
        // Store the top-left tile position of the 2x2 ore vein
        this.tileX = tileX;
        this.tileY = tileY;
        this.oreType = oreType;
        this.stage = MINING_STAGE.FULL;
        this.hitsRemaining = oreType.hitsPerStage;

        // Visual state
        this.isGone = false;
        this.alpha = 1;
        this.fadeTimer = 0;
        this.fadeDuration = 500; // ms to fade out after depleted
    }

    // Get the current tile IDs based on mining stage
    getTileIds() {
        switch (this.stage) {
            case MINING_STAGE.FULL:
                return this.oreType.stages.full;
            case MINING_STAGE.PARTIAL:
                return this.oreType.stages.partial;
            case MINING_STAGE.DEPLETED:
                return this.oreType.stages.depleted;
            case MINING_STAGE.GONE:
                return [];
            default:
                return this.oreType.stages.full;
        }
    }

    // Get positions of all 4 tiles (2x2 grid)
    getTilePositions() {
        return [
            { x: this.tileX, y: this.tileY },         // top-left
            { x: this.tileX + 1, y: this.tileY },     // top-right
            { x: this.tileX, y: this.tileY + 1 },     // bottom-left
            { x: this.tileX + 1, y: this.tileY + 1 }  // bottom-right
        ];
    }

    // Check if a tile position is part of this ore vein
    containsTile(tileX, tileY) {
        return (tileX === this.tileX || tileX === this.tileX + 1) &&
               (tileY === this.tileY || tileY === this.tileY + 1);
    }

    // Mine the ore vein - returns true if stage changed, ore icon tile ID if yielded ore
    mine() {
        if (this.stage === MINING_STAGE.GONE) {
            return { stageChanged: false, oreYielded: null };
        }

        this.hitsRemaining--;

        if (this.hitsRemaining <= 0) {
            // Advance to next stage
            const previousStage = this.stage;
            this.stage++;
            this.hitsRemaining = this.oreType.hitsPerStage;

            // Yield ore when transitioning stages (except when going to GONE)
            const oreYielded = this.stage <= MINING_STAGE.GONE ? this.oreType.iconTileId : null;

            console.log(`Ore vein mined: ${this.oreType.name} stage ${previousStage} -> ${this.stage}`);

            return { stageChanged: true, oreYielded: oreYielded };
        }

        return { stageChanged: false, oreYielded: null };
    }

    // Check if the ore vein can still be mined
    canBeMined() {
        return this.stage < MINING_STAGE.GONE && !this.isGone;
    }

    // Check if ore vein is completely depleted
    isDepleted() {
        return this.stage >= MINING_STAGE.GONE;
    }

    update(deltaTime) {
        // Handle fading out after becoming gone
        if (this.stage === MINING_STAGE.GONE && !this.isGone) {
            this.fadeTimer += deltaTime;
            this.alpha = 1 - (this.fadeTimer / this.fadeDuration);

            if (this.fadeTimer >= this.fadeDuration) {
                this.isGone = true;
                this.alpha = 0;
            }
        }
    }

    // Get the Y position for depth sorting
    // Use slightly before the middle of the bottom row (tileY + 1) as the depth line
    // Characters whose center is at or past this point appear in front
    getSortY(tileSize) {
        return (this.tileY + 1.5) * tileSize - 1;
    }
}

// Helper to get ore type by name
export function getOreTypeByName(name) {
    return ORE_TYPES[name.toUpperCase()] || null;
}

// Helper to get random ore type
export function getRandomOreType() {
    const oreKeys = Object.keys(ORE_TYPES);
    const randomKey = oreKeys[Math.floor(Math.random() * oreKeys.length)];
    return ORE_TYPES[randomKey];
}
