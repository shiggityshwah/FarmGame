// Tree types with their tile IDs
// Thin tree: 1x3 tiles (single column, 3 rows high)
// Thick tree: 2x3 tiles (2 columns, 3 rows high)

// Wood icon tile ID for "+1 wood" effect
const WOOD_ICON_TILE_ID = 753;

export const TREE_TYPES = {
    THIN: {
        name: 'Thin Tree',
        width: 1,
        height: 3,
        // Tiles from top to bottom
        tiles: [244, 308, 372],
        // Resource range for small trees: 2-5 wood
        minResources: 2,
        maxResources: 5
    },
    THICK: {
        name: 'Thick Tree',
        width: 2,
        height: 3,
        // Tiles arranged as: [top-left, top-right, mid-left, mid-right, bottom-left, bottom-right]
        tiles: [435, 436, 499, 500, 563, 564],
        // Resource range for large trees: 5-10 wood
        minResources: 5,
        maxResources: 10
    }
};

// Tree is gone when resources are depleted
export const CHOP_STAGE = {
    FULL: 0,
    GONE: 1
};

export class Tree {
    constructor(tileX, tileY, treeType) {
        // Store the bottom-left tile position (base tile for collision tracking)
        this.tileX = tileX;
        this.tileY = tileY;
        this.treeType = treeType;
        this.stage = CHOP_STAGE.FULL;

        // Randomize resource amount based on tree type
        const { minResources, maxResources } = treeType;
        this.resourcesRemaining = Math.floor(Math.random() * (maxResources - minResources + 1)) + minResources;
        this.initialResources = this.resourcesRemaining;

        // Visual state
        this.isGone = false;
        this.alpha = 1;
        this.fadeTimer = 0;
        this.fadeDuration = 500; // ms to fade out after depletion
    }

    // Get the tile positions this tree occupies (base tiles at bottom)
    getBaseTilePositions() {
        const positions = [];
        for (let x = 0; x < this.treeType.width; x++) {
            positions.push({ x: this.tileX + x, y: this.tileY });
        }
        return positions;
    }

    // Get all tile positions this tree occupies
    getAllTilePositions() {
        const positions = [];
        for (let y = 0; y < this.treeType.height; y++) {
            for (let x = 0; x < this.treeType.width; x++) {
                positions.push({
                    x: this.tileX + x,
                    y: this.tileY - (this.treeType.height - 1 - y) // y goes upward from base
                });
            }
        }
        return positions;
    }

    // Get the current tile IDs and their positions for rendering
    getTilesForRender() {
        const tiles = [];
        const stageTiles = this.getCurrentStageTiles();

        if (this.treeType.width === 1) {
            // Thin tree: single column
            for (let i = 0; i < stageTiles.length; i++) {
                tiles.push({
                    id: stageTiles[i],
                    x: this.tileX,
                    y: this.tileY - (stageTiles.length - 1 - i) // Top tile first, bottom last
                });
            }
        } else {
            // Thick tree: 2 columns
            const rows = stageTiles.length / 2;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < 2; col++) {
                    const tileIndex = row * 2 + col;
                    tiles.push({
                        id: stageTiles[tileIndex],
                        x: this.tileX + col,
                        y: this.tileY - (rows - 1 - row)
                    });
                }
            }
        }

        return tiles;
    }

    getCurrentStageTiles() {
        switch (this.stage) {
            case CHOP_STAGE.FULL:
                return this.treeType.tiles;
            case CHOP_STAGE.GONE:
                return [];
            default:
                return this.treeType.tiles;
        }
    }

    // Check if a tile position is part of this tree (for clicking)
    // Uses current rendered tiles based on stage
    containsTile(tileX, tileY) {
        const tiles = this.getTilesForRender();
        return tiles.some(tile => tile.x === tileX && tile.y === tileY);
    }

    // Check if clicking on the base (bottom) tiles
    containsBaseTile(tileX, tileY) {
        const basePositions = this.getBaseTilePositions();
        return basePositions.some(pos => pos.x === tileX && pos.y === tileY);
    }

    // Chop the tree - each chop yields 1 wood until depleted
    chop() {
        if (this.stage >= CHOP_STAGE.GONE || this.resourcesRemaining <= 0) {
            return { stageChanged: false, woodYielded: null };
        }

        // Each chop yields 1 resource
        this.resourcesRemaining--;
        const woodYielded = WOOD_ICON_TILE_ID;

        console.log(`Tree chopped: ${this.treeType.name} - ${this.resourcesRemaining}/${this.initialResources} wood remaining`);

        // Check if tree is depleted
        if (this.resourcesRemaining <= 0) {
            this.stage = CHOP_STAGE.GONE;
            console.log(`${this.treeType.name} depleted!`);
            return { stageChanged: true, woodYielded: woodYielded, depleted: true };
        }

        return { stageChanged: false, woodYielded: woodYielded, depleted: false };
    }

    // Check if tree can still be chopped (has resources remaining)
    canBeChopped() {
        return this.stage < CHOP_STAGE.GONE && this.resourcesRemaining > 0 && !this.isGone;
    }

    // Check if tree is completely removed
    isRemoved() {
        return this.stage >= CHOP_STAGE.GONE || this.resourcesRemaining <= 0;
    }

    update(deltaTime) {
        // Handle fading out after becoming gone
        if (this.stage === CHOP_STAGE.GONE && !this.isGone) {
            this.fadeTimer += deltaTime;
            this.alpha = 1 - (this.fadeTimer / this.fadeDuration);

            if (this.fadeTimer >= this.fadeDuration) {
                this.isGone = true;
                this.alpha = 0;
            }
        }
    }

    // Get the Y position for depth sorting
    // Use the bottom of the tree (base tile) for sorting
    getSortY(tileSize) {
        return (this.tileY + 0.5) * tileSize;
    }
}

// Helper to get a random tree type
export function getRandomTreeType() {
    const types = Object.values(TREE_TYPES);
    return types[Math.floor(Math.random() * types.length)];
}
