// Crop types with their tile ID offsets
export const CROP_TYPES = {
    CARROT: { index: 0, name: 'Carrot' },
    CAULIFLOWER: { index: 1, name: 'Cauliflower' },
    PUMPKIN: { index: 2, name: 'Pumpkin' },
    SUNFLOWER: { index: 3, name: 'Sunflower' },
    RADISH: { index: 4, name: 'Radish' },
    PARSNIP: { index: 5, name: 'Parsnip' },
    POTATO: { index: 6, name: 'Potato' },
    CABBAGE: { index: 7, name: 'Cabbage' },
    BEETROOT: { index: 8, name: 'Beetroot' },
    WHEAT: { index: 9, name: 'Wheat' },
    WEED: { index: 10, name: 'Weed' }
};

// Helper to get crop type by index
export function getCropTypeByIndex(index) {
    for (const key of Object.keys(CROP_TYPES)) {
        if (CROP_TYPES[key].index === index) {
            return CROP_TYPES[key];
        }
    }
    return CROP_TYPES.CARROT; // Default fallback
}

// Growth stages
export const GROWTH_STAGE = {
    PLANTING_PHASE1: -2,  // First doing animation, hole becomes half-closed (1010)
    PLANTED: -1,          // Second doing animation done, hole closed (818), needs watering
    SEED: 0,              // After watering, wet hole (882), seed starting to sprout
    SEEDLING: 1,
    EARLY_GROWTH: 2,
    ALMOST_HARVESTABLE: 3,
    HARVESTABLE: 4
};

// Base tile IDs for each growth stage
const TILE_BASE = {
    HARVESTED: 691,      // The crop item itself
    SEED: 755,           // Seeds in ground
    SEEDLING: 819,       // Small sprout
    EARLY_GROWTH: 883,   // Growing plant
    ALMOST_TOP: 947,     // Almost ready (top tile)
    ALMOST_BOTTOM: 1011, // Almost ready (bottom tile)
    HARVEST_TOP: 1075,   // Ready to harvest (top tile)
    HARVEST_BOTTOM: 1139 // Ready to harvest (bottom tile)
};

// Dirt patch tiles (displayed under the crop)
const DIRT_TILES = {
    DRY: 818,
    WET: 882,
    SMALL_HOLE: 1010,
    LARGE_HOLE: 1138
};

// Growth time per stage in milliseconds
const GROWTH_TIME = 3000; // 3 seconds per stage

// Post-harvest stages
const HARVEST_STAGE = {
    LARGE_HOLE: 0,
    SMALL_HOLE: 1,
    DRY_DIRT: 2,
    FADING: 3,
    GONE: 4
};

// Time for each post-harvest stage in milliseconds
const HARVEST_STAGE_TIMES = {
    [HARVEST_STAGE.LARGE_HOLE]: 100,    // 0.5 seconds
    [HARVEST_STAGE.SMALL_HOLE]: 100,    // 0.5 seconds
    [HARVEST_STAGE.DRY_DIRT]: 2000,     // 2 seconds
    [HARVEST_STAGE.FADING]: 2000        // 2 seconds
};

export class Crop {
    constructor(tileX, tileY, cropType, startAsPlanted = false) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.cropType = cropType;
        this.stage = startAsPlanted ? GROWTH_STAGE.PLANTING_PHASE1 : GROWTH_STAGE.SEED;
        this.growthTimer = 0;
        this.isHarvested = false;
        this.isWatered = !startAsPlanted;  // Existing crops start watered, planted crops need watering

        // Post-harvest state
        this.harvestStage = HARVEST_STAGE.LARGE_HOLE;
        this.harvestTimer = 0;
        this.alpha = 1;
        this.isGone = false;
    }

    // Advance planting phase (called after each DOING animation)
    advancePlantingPhase() {
        if (this.stage === GROWTH_STAGE.PLANTING_PHASE1) {
            this.stage = GROWTH_STAGE.PLANTED;
            return true;
        }
        return false;
    }

    // Water the crop to start growth
    water() {
        if (this.isWatered || this.isHarvested) return false;
        this.isWatered = true;
        // If planted but not yet growing, start growing
        if (this.stage === GROWTH_STAGE.PLANTED) {
            this.stage = GROWTH_STAGE.SEED;
        }
        console.log(`Watered ${this.cropType.name} at (${this.tileX}, ${this.tileY})`);
        return true;
    }

    update(deltaTime) {
        // Handle post-harvest animation
        if (this.isHarvested) {
            if (this.harvestStage >= HARVEST_STAGE.GONE) {
                this.isGone = true;
                return;
            }

            this.harvestTimer += deltaTime;

            const stageTime = HARVEST_STAGE_TIMES[this.harvestStage];

            if (this.harvestStage === HARVEST_STAGE.FADING) {
                // Fade out during fading stage
                this.alpha = 1 - (this.harvestTimer / stageTime);
                if (this.alpha <= 0) {
                    this.alpha = 0;
                    this.harvestStage = HARVEST_STAGE.GONE;
                    this.isGone = true;
                }
            } else if (this.harvestTimer >= stageTime) {
                this.harvestTimer = 0;
                this.harvestStage++;
            }
            return;
        }

        // Only grow if watered
        if (!this.isWatered) return;

        // Handle growth
        if (this.stage >= GROWTH_STAGE.HARVESTABLE) {
            return;
        }

        // Don't grow if still in planted stage (needs watering first)
        if (this.stage === GROWTH_STAGE.PLANTED) {
            return;
        }

        this.growthTimer += deltaTime;

        if (this.growthTimer >= GROWTH_TIME) {
            this.growthTimer = 0;
            this.stage++;
        }
    }

    getTileIds() {
        // Show dirt closing up after harvest
        if (this.isHarvested) {
            switch (this.harvestStage) {
                case HARVEST_STAGE.LARGE_HOLE:
                    return [{ id: DIRT_TILES.LARGE_HOLE, offsetY: 0 }];
                case HARVEST_STAGE.SMALL_HOLE:
                    return [{ id: DIRT_TILES.SMALL_HOLE, offsetY: 0 }];
                case HARVEST_STAGE.DRY_DIRT:
                case HARVEST_STAGE.FADING:
                    return [{ id: DIRT_TILES.DRY, offsetY: 0 }];
                default:
                    return [];
            }
        }

        const offset = this.cropType.index;

        switch (this.stage) {
            case GROWTH_STAGE.PLANTING_PHASE1:
                // First phase of planting, show half-closed hole (1010)
                return [
                    { id: DIRT_TILES.SMALL_HOLE, offsetY: 0 }
                ];

            case GROWTH_STAGE.PLANTED:
                // Fully planted, show closed dry hole (818), needs watering
                return [
                    { id: DIRT_TILES.DRY, offsetY: 0 }
                ];

            case GROWTH_STAGE.SEED:
                // After watering, show closed wet hole (no visible seed yet)
                return [
                    { id: DIRT_TILES.WET, offsetY: 0 }
                ];

            case GROWTH_STAGE.SEEDLING:
                return [
                    { id: DIRT_TILES.WET, offsetY: 0 },
                    { id: TILE_BASE.SEEDLING + offset, offsetY: 0 }
                ];

            case GROWTH_STAGE.EARLY_GROWTH:
                return [
                    { id: DIRT_TILES.WET, offsetY: 0 },
                    { id: TILE_BASE.EARLY_GROWTH + offset, offsetY: 0 }
                ];

            case GROWTH_STAGE.ALMOST_HARVESTABLE:
                return [
                    { id: DIRT_TILES.WET, offsetY: 0 },
                    { id: TILE_BASE.ALMOST_TOP + offset, offsetY: -1 },
                    { id: TILE_BASE.ALMOST_BOTTOM + offset, offsetY: 0 }
                ];

            case GROWTH_STAGE.HARVESTABLE:
                return [
                    { id: DIRT_TILES.DRY, offsetY: 0 },
                    { id: TILE_BASE.HARVEST_TOP + offset, offsetY: -1 },
                    { id: TILE_BASE.HARVEST_BOTTOM + offset, offsetY: 0 }
                ];

            default:
                return [];
        }
    }

    getHarvestedTileId() {
        return TILE_BASE.HARVESTED + this.cropType.index;
    }

    isReadyToHarvest() {
        return this.stage === GROWTH_STAGE.HARVESTABLE && !this.isHarvested;
    }

    harvest() {
        if (this.isReadyToHarvest()) {
            this.isHarvested = true;
            return true;
        }
        return false;
    }

    // Check if a tile position is part of this crop (for click detection)
    containsTile(tileX, tileY) {
        if (this.isHarvested) return false;

        // For tall crops (stages 3 and 4), check both tiles
        if (this.stage >= GROWTH_STAGE.ALMOST_HARVESTABLE) {
            return (tileX === this.tileX && (tileY === this.tileY || tileY === this.tileY - 1));
        }

        return tileX === this.tileX && tileY === this.tileY;
    }

    // Get the Y position for depth sorting
    // Use slightly before the middle of the bottom tile as the depth line
    // Characters whose center is at or past this point appear in front
    getSortY(tileSize) {
        return (this.tileY + 0.5) * tileSize - 1;
    }
}
