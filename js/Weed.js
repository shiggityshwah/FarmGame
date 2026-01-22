// Weed class - similar to flowers but requires multiple clicks to remove based on stage
// Weeds don't provide any harvest yield
// Uses the weed sprites from Crop.js (CROP_TYPES.WEED with index 10)

export const WEED_STAGES = {
    STAGE_0: 0,  // Gone/removed
    STAGE_1: 1,  // Uses SEEDLING sprite
    STAGE_2: 2,  // Uses EARLY_GROWTH sprite
    STAGE_3: 3,  // Uses ALMOST_HARVESTABLE sprite
    STAGE_4: 4   // Uses HARVESTABLE sprite
};

// Weed tile IDs using the crop system's tile base IDs
// Weed has index 10 in CROP_TYPES
const WEED_INDEX = 10;
const TILE_BASE = {
    SEEDLING: 819,       // Small sprout
    EARLY_GROWTH: 883,   // Growing plant
    ALMOST_TOP: 947,     // Almost ready (top tile)
    ALMOST_BOTTOM: 1011, // Almost ready (bottom tile)
    HARVEST_TOP: 1075,   // Ready to harvest (top tile)
    HARVEST_BOTTOM: 1139 // Ready to harvest (bottom tile)
};

// Weed tile IDs based on crop system
const WEED_TILES = {
    [WEED_STAGES.STAGE_1]: [{ id: TILE_BASE.SEEDLING + WEED_INDEX, offsetY: 0 }],  // Small weed
    [WEED_STAGES.STAGE_2]: [{ id: TILE_BASE.EARLY_GROWTH + WEED_INDEX, offsetY: 0 }],  // Medium weed
    [WEED_STAGES.STAGE_3]: [
        { id: TILE_BASE.ALMOST_TOP + WEED_INDEX, offsetY: -1 },
        { id: TILE_BASE.ALMOST_BOTTOM + WEED_INDEX, offsetY: 0 }
    ],  // Large weed (2 tiles)
    [WEED_STAGES.STAGE_4]: [
        { id: TILE_BASE.HARVEST_TOP + WEED_INDEX, offsetY: -1 },
        { id: TILE_BASE.HARVEST_BOTTOM + WEED_INDEX, offsetY: 0 }
    ]  // Very large weed (2 tiles)
};

export class Weed {
    constructor(tileX, tileY) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.stage = WEED_STAGES.STAGE_1; // Always start at stage 1
        this.isRemoved = false;
        this.isGone = false;

        // Growth mechanics
        this.growthTimer = 0;
        this.growthTimeMinutes = 2; // 2 minutes total to reach stage 4
        // There are 4 stages, so each stage takes 2 minutes / 3 transitions = ~40 seconds per stage
        this.growthTimePerStage = (this.growthTimeMinutes * 60 * 1000) / 3; // milliseconds per stage transition

        // Store tile data for this stage
        this.tileData = WEED_TILES[this.stage];

        // Fade out animation after removal
        this.alpha = 1;
        this.fadeSpeed = 2; // Alpha per second
    }

    // Check if this weed occupies the given tile
    containsTile(tileX, tileY) {
        // For tall weeds (stages 3 and 4), check both tiles
        if (this.stage >= WEED_STAGES.STAGE_3) {
            return (tileX === this.tileX && (tileY === this.tileY || tileY === this.tileY - 1));
        }
        return this.tileX === tileX && this.tileY === tileY;
    }

    // Click on the weed - regresses to previous stage (returns true if removed, false if still exists)
    click() {
        if (this.isRemoved || this.isGone || this.stage <= WEED_STAGES.STAGE_0) return false;
        
        // Regress to previous stage
        this.stage--;
        this.tileData = WEED_TILES[this.stage] || []; // Update tile data
        
        // Reset growth timer when clicked (so it doesn't immediately grow back)
        this.growthTimer = 0;
        
        // If stage reached 0 or below, mark as removed
        if (this.stage <= WEED_STAGES.STAGE_0) {
            this.isRemoved = true;
            return true;
        }
        
        return false;
    }

    // Advance to next growth stage
    advanceStage() {
        if (this.stage < WEED_STAGES.STAGE_4) {
            this.stage++;
            this.clicksRemaining = this.stage; // Update clicks needed based on new stage
            this.tileData = WEED_TILES[this.stage]; // Update tile data
            console.log(`Weed at (${this.tileX}, ${this.tileY}) grew to stage ${this.stage}`);
        }
    }


    // Update weed state (growth and fade out animation)
    update(deltaTime) {
        // Handle growth if not removed and not at max stage
        if (!this.isRemoved && !this.isGone && this.stage < WEED_STAGES.STAGE_4 && this.stage > WEED_STAGES.STAGE_0) {
            this.growthTimer += deltaTime;
            
            if (this.growthTimer >= this.growthTimePerStage) {
                this.growthTimer = 0;
                this.advanceStage();
            }
        }

        // Handle fade out animation after removal
        if (this.isRemoved && !this.isGone) {
            this.alpha -= this.fadeSpeed * (deltaTime / 1000);
            if (this.alpha <= 0) {
                this.alpha = 0;
                this.isGone = true;
            }
        }
    }

    // Get sort Y for depth rendering
    getSortY(tileSize) {
        return this.tileY * tileSize;
    }

    // Get the tile data for rendering (returns array of tiles for multi-tile weeds)
    getTileData() {
        // Return empty array if weed is gone
        if (this.stage <= WEED_STAGES.STAGE_0 || this.isRemoved) {
            return [];
        }
        return this.tileData;
    }
}
