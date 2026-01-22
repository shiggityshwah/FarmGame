// Flower types with rarity and tile IDs
// Tile IDs are overlay tiles that render on top of grass

export const FLOWER_TYPES = {
    BLUE: {
        name: 'Blue Flower',
        rarity: 0.1,  // 10% chance (rarest)
        tiles: [95, 96, 97, 98],  // Tile variations
        doubleTile: 97,  // This tile gives 2 flowers
        harvestIcon: 227  // Generic flower icon for harvest effect
    },
    RED: {
        name: 'Red Flower',
        rarity: 0.3,  // 30% chance (medium)
        tiles: [159, 160, 161, 162],
        doubleTile: 161,
        harvestIcon: 227
    },
    WHITE: {
        name: 'White Flower',
        rarity: 0.6,  // 60% chance (most common)
        tiles: [223, 224, 225, 226],
        doubleTile: 225,
        harvestIcon: 227
    }
};

export class Flower {
    constructor(tileX, tileY, flowerType, tileId) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.flowerType = flowerType;
        this.tileId = tileId;

        // Whether this flower gives double yield
        this.isDouble = tileId === flowerType.doubleTile;
        this.harvestYield = this.isDouble ? 2 : 1;

        // State
        this.isHarvested = false;
        this.isGone = false;

        // Fade out animation after harvest
        this.alpha = 1;
        this.fadeSpeed = 2; // Alpha per second
    }

    // Check if this flower occupies the given tile
    containsTile(tileX, tileY) {
        return this.tileX === tileX && this.tileY === tileY;
    }

    // Harvest the flower
    harvest() {
        if (this.isHarvested) return 0;
        this.isHarvested = true;
        return this.harvestYield;
    }

    // Update flower state (for fade out animation)
    update(deltaTime) {
        if (this.isHarvested && !this.isGone) {
            this.alpha -= this.fadeSpeed * (deltaTime / 1000);
            if (this.alpha <= 0) {
                this.alpha = 0;
                this.isGone = true;
            }
        }
    }

    // Get sort Y for depth rendering
    // Flowers are ground decorations and should always appear behind characters
    // Using tileY * tileSize (top of tile) ensures they render before entities at the same position
    getSortY(tileSize) {
        return this.tileY * tileSize;
    }

    // Get the tile data for rendering
    getTileData() {
        return {
            id: this.tileId,
            offsetY: 0
        };
    }
}

// Select a random flower type based on rarity weights
export function getRandomFlowerType() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [key, type] of Object.entries(FLOWER_TYPES)) {
        cumulative += type.rarity;
        if (rand < cumulative) {
            return type;
        }
    }

    // Fallback to white (most common)
    return FLOWER_TYPES.WHITE;
}

// Get a random tile ID for a flower type
export function getRandomFlowerTile(flowerType) {
    const tileIndex = Math.floor(Math.random() * flowerType.tiles.length);
    return flowerType.tiles[tileIndex];
}
