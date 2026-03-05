// Crop types with their tile ID offsets
// seed_cost / sell_price match the values in Inventory.js RESOURCE_TYPES
export const CROP_TYPES = {
    CARROT:      { index: 0,  name: 'Carrot',      tier: 1, seed_cost: 5,     sell_price: 10,     growth_time_minutes: 2,  wateringsPerStage: 1 },
    CAULIFLOWER: { index: 1,  name: 'Cauliflower', tier: 3, seed_cost: 2000,  sell_price: 4000,   growth_time_minutes: 10, wateringsPerStage: 1 },
    PUMPKIN:     { index: 2,  name: 'Pumpkin',     tier: 4, seed_cost: 50000, sell_price: 100000, growth_time_minutes: 16, wateringsPerStage: 2 },
    SUNFLOWER:   { index: 3,  name: 'Sunflower',   tier: 3, seed_cost: 5000,  sell_price: 10000,  growth_time_minutes: 10, wateringsPerStage: 2 },
    RADISH:      { index: 4,  name: 'Radish',      tier: 1, seed_cost: 15,    sell_price: 30,     growth_time_minutes: 2,  wateringsPerStage: 1 },
    PARSNIP:     { index: 5,  name: 'Parsnip',     tier: 1, seed_cost: 40,    sell_price: 80,     growth_time_minutes: 3,  wateringsPerStage: 1 },
    POTATO:      { index: 6,  name: 'Potato',      tier: 2, seed_cost: 100,   sell_price: 200,    growth_time_minutes: 5,  wateringsPerStage: 1 },
    CABBAGE:     { index: 7,  name: 'Cabbage',     tier: 2, seed_cost: 800,   sell_price: 1600,   growth_time_minutes: 6,  wateringsPerStage: 1 },
    BEETROOT:    { index: 8,  name: 'Beetroot',    tier: 2, seed_cost: 300,   sell_price: 600,    growth_time_minutes: 5,  wateringsPerStage: 1 },
    WHEAT:       { index: 9,  name: 'Wheat',       tier: 3, seed_cost: 15000, sell_price: 30000,  growth_time_minutes: 8,  wateringsPerStage: 2 },
    WEED:        { index: 10, name: 'Weed',        growth_time_minutes: 2 }
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

// Growth time per stage in milliseconds (will be calculated per crop based on growth_time_minutes)
// There are 5 growth stages (SEED -> SEEDLING -> EARLY_GROWTH -> ALMOST_HARVESTABLE -> HARVESTABLE)
const GROWTH_STAGES_COUNT = 5;

// 30-second cooldown between multiple waterings on the same stage
const WATERING_COOLDOWN_MS = 30000;

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
        this.startAsPlanted = startAsPlanted;
        this.stage = startAsPlanted ? GROWTH_STAGE.PLANTING_PHASE1 : GROWTH_STAGE.SEED;
        this.growthTimer = 0;
        this.isHarvested = false;

        // Watering state machine (replaces the old isWatered boolean)
        // 'needs_water'       — waiting for water at this stage
        // 'watering_cooldown' — 30s wait between multiple waterings (multi-water crops only)
        // 'growing'           — growth timer is running
        //
        // Player-planted crops (startAsPlanted=true): begin at PLANTING_PHASE1 needing water.
        // Wild/forest crops (startAsPlanted=false):   start directly growing (no water needed).
        this.wateringState = startAsPlanted ? 'needs_water' : 'growing';
        this.wateringsThisStage = 0;    // count of waterings received for current stage
        this.wateringCooldownTimer = 0; // ms remaining in watering cooldown

        // Post-harvest state
        this.harvestStage = HARVEST_STAGE.LARGE_HOLE;
        this.harvestTimer = 0;
        this.alpha = 1;
        this.isGone = false;
    }

    /**
     * Backward-compatible getter — returns true when the crop does NOT need water
     * (i.e. it is either growing or in its watering cooldown period).
     */
    get isWatered() {
        return this.wateringState !== 'needs_water';
    }

    // Advance planting phase (called after each DOING animation)
    advancePlantingPhase() {
        if (this.stage === GROWTH_STAGE.PLANTING_PHASE1) {
            this.stage = GROWTH_STAGE.PLANTED;
            return true;
        }
        return false;
    }

    /**
     * Water the crop.
     * Only accepted when wateringState === 'needs_water'.
     *
     * For PLANTED stage: immediately transitions to SEED and starts growing.
     * For later stages:
     *   - Increments wateringsThisStage.
     *   - If more waterings are required: enters 'watering_cooldown' (30s).
     *   - When all required waterings are done: enters 'growing' and starts the growth timer.
     *
     * Returns true if water was accepted, false otherwise.
     */
    water() {
        if (this.wateringState !== 'needs_water') return false;
        if (this.isHarvested) return false;

        // PLANTED → SEED transition (first watering after planting)
        if (this.stage === GROWTH_STAGE.PLANTED) {
            this.stage = GROWTH_STAGE.SEED;
            this.wateringState = 'growing';
            this.wateringsThisStage = 0;
            return true;
        }

        this.wateringsThisStage++;
        const needed = this.cropType.wateringsPerStage ?? 1;

        if (this.wateringsThisStage < needed) {
            // More waterings required — enter cooldown before accepting the next one
            this.wateringState = 'watering_cooldown';
            this.wateringCooldownTimer = WATERING_COOLDOWN_MS;
        } else {
            // All required waterings done — start the growth timer
            this.wateringsThisStage = 0;
            this.wateringState = 'growing';
        }

        console.log(`Watered ${this.cropType.name} at (${this.tileX}, ${this.tileY}) [${this.wateringsThisStage}/${needed}]`);
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

        // Tick down the watering cooldown (multi-water crops)
        if (this.wateringState === 'watering_cooldown') {
            this.wateringCooldownTimer -= deltaTime;
            if (this.wateringCooldownTimer <= 0) {
                this.wateringCooldownTimer = 0;
                this.wateringState = 'needs_water';
            }
            return;
        }

        // Wait for water if needed
        if (this.wateringState !== 'growing') return;

        // Nothing to grow past HARVESTABLE, and PLANTED needs water first
        if (this.stage >= GROWTH_STAGE.HARVESTABLE) return;
        if (this.stage === GROWTH_STAGE.PLANTED) return;

        // Advance growth timer
        this.growthTimer += deltaTime;

        // Calculate growth time per stage based on crop's growth_time_minutes
        const growthTimePerStage = (this.cropType.growth_time_minutes || 2) * 60 * 1000 / GROWTH_STAGES_COUNT;

        if (this.growthTimer >= growthTimePerStage) {
            this.growthTimer = 0;
            this.stage++;

            // After advancing to a new stage, require watering again (unless now harvestable or wild)
            if (this.stage < GROWTH_STAGE.HARVESTABLE && this.startAsPlanted) {
                this.wateringState = 'needs_water';
                this.wateringsThisStage = 0;
            }
        }
    }

    getTileIds() {
        // Show dirt closing up after harvest
        if (this.isHarvested) {
            switch (this.harvestStage) {
                case HARVEST_STAGE.LARGE_HOLE:
                    return [{ id: DIRT_TILES.LARGE_HOLE, offsetY: 0, isGround: true }];
                case HARVEST_STAGE.SMALL_HOLE:
                    return [{ id: DIRT_TILES.SMALL_HOLE, offsetY: 0, isGround: true }];
                case HARVEST_STAGE.DRY_DIRT:
                case HARVEST_STAGE.FADING:
                    return [{ id: DIRT_TILES.DRY, offsetY: 0, isGround: true }];
                default:
                    return [];
            }
        }

        const offset = this.cropType.index;

        switch (this.stage) {
            case GROWTH_STAGE.PLANTING_PHASE1:
                // First phase of planting, show half-closed hole (1010)
                return [
                    { id: DIRT_TILES.SMALL_HOLE, offsetY: 0, isGround: true }
                ];

            case GROWTH_STAGE.PLANTED:
                // Fully planted, show closed dry hole (818), needs watering
                return [
                    { id: DIRT_TILES.DRY, offsetY: 0, isGround: true }
                ];

            case GROWTH_STAGE.SEED:
                // After watering, show closed wet hole (no visible seed yet)
                return [
                    { id: DIRT_TILES.WET, offsetY: 0, isGround: true }
                ];

            case GROWTH_STAGE.SEEDLING: {
                const groundTile = this.wateringState === 'needs_water' ? DIRT_TILES.DRY : DIRT_TILES.WET;
                return [
                    { id: groundTile, offsetY: 0, isGround: true },
                    { id: TILE_BASE.SEEDLING + offset, offsetY: 0 }
                ];
            }

            case GROWTH_STAGE.EARLY_GROWTH: {
                const groundTile = this.wateringState === 'needs_water' ? DIRT_TILES.DRY : DIRT_TILES.WET;
                return [
                    { id: groundTile, offsetY: 0, isGround: true },
                    { id: TILE_BASE.EARLY_GROWTH + offset, offsetY: 0 }
                ];
            }

            case GROWTH_STAGE.ALMOST_HARVESTABLE: {
                const groundTile = this.wateringState === 'needs_water' ? DIRT_TILES.DRY : DIRT_TILES.WET;
                return [
                    { id: groundTile, offsetY: 0, isGround: true },
                    { id: TILE_BASE.ALMOST_TOP + offset, offsetY: -1 },
                    { id: TILE_BASE.ALMOST_BOTTOM + offset, offsetY: 0 }
                ];
            }

            case GROWTH_STAGE.HARVESTABLE:
                return [
                    { id: DIRT_TILES.DRY, offsetY: 0, isGround: true },
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
