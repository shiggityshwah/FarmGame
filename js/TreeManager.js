import { Tree, TREE_TYPES, CHOP_STAGE, getRandomTreeType } from './Tree.js';
import { Logger } from './Logger.js';
import { createHarvestEffect } from './EffectUtils.js';
import { ResourceManager } from './ResourceManager.js';

const log = Logger.create('TreeManager');

export class TreeManager extends ResourceManager {
    constructor(tilemap) {
        super(tilemap);
        this.trees = this.resources; // Alias for readability
    }

    // Spawn a tree at a specific tile position (bottom-left base tile)
    spawnTree(tileX, tileY, treeType = null) {
        if (!treeType) {
            treeType = getRandomTreeType();
        }

        const tree = new Tree(tileX, tileY, treeType);
        this.trees.push(tree);

        log.debug(`Spawned ${treeType.name} at base (${tileX}, ${tileY})`);
        return tree;
    }

    // Spawn random trees in the grass area, avoiding occupied positions
    spawnRandomTrees(count = 1, occupiedBaseTiles = new Set()) {
        const localOccupied = new Set(occupiedBaseTiles);

        for (let i = 0; i < count; i++) {
            let tileX, tileY, posKey;
            let attempts = 0;
            let treeType;

            do {
                treeType = getRandomTreeType();

                // Get a random position for the base tile
                const pos = this.tilemap.getRandomTilePosition();

                // For thick trees, make sure we don't go off the right edge
                tileX = Math.min(pos.tileX, this.tilemap.mapWidth - treeType.width);
                tileY = pos.tileY;

                // Make sure we're in the grass area (below house)
                const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
                if (tileY < grassStartY) {
                    tileY = grassStartY;
                }

                // Check all base tiles for this tree type
                let conflict = false;
                for (let x = 0; x < treeType.width; x++) {
                    posKey = `${tileX + x},${tileY}`;
                    if (localOccupied.has(posKey)) {
                        conflict = true;
                        break;
                    }
                }

                if (!conflict) {
                    break;
                }

                attempts++;
            } while (attempts < 100);

            if (attempts >= 100) continue;

            // Mark all base tiles as occupied
            for (let x = 0; x < treeType.width; x++) {
                localOccupied.add(`${tileX + x},${tileY}`);
            }

            this.spawnTree(tileX, tileY, treeType);
        }

        log.debug(`Spawned ${this.trees.length} trees`);
        return localOccupied;
    }

    // Spawn trees in a specific rectangular area (for south forest area, purchased chunks, etc.)
    // Returns the updated occupied set with new tree positions added
    spawnTreesInArea(x, y, w, h, count = 5, occupiedSet = new Set()) {
        const localOccupied = new Set(occupiedSet);
        let placed = 0;

        for (let i = 0; i < count * 3 && placed < count; i++) {
            const treeType = getRandomTreeType();
            const tileX = x + Math.floor(Math.random() * Math.max(1, w - treeType.width + 1));
            const tileY = y + Math.floor(Math.random() * Math.max(1, h));

            let conflict = false;
            for (let dx = 0; dx < treeType.width; dx++) {
                if (localOccupied.has(`${tileX + dx},${tileY}`)) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) continue;

            for (let dx = 0; dx < treeType.width; dx++) {
                localOccupied.add(`${tileX + dx},${tileY}`);
            }

            this.spawnTree(tileX, tileY, treeType);
            placed++;
        }

        log.debug(`spawnTreesInArea: placed ${placed}/${count} trees in (${x},${y}) ${w}×${h}`);
        return localOccupied;
    }

    // Get tree at a tile position (checks all tiles of each tree)
    getTreeAt(tileX, tileY) { return this.getResourceAt(tileX, tileY); }

    // Chop a tree at a tile position
    // Each chop yields 1 wood - tree disappears when resources depleted
    chopTree(tileX, tileY) {
        const tree = this.getTreeAt(tileX, tileY);
        if (!tree || !tree.canBeChopped()) {
            return null;
        }

        const result = tree.chop();

        // Create chopping effect if wood was yielded (every successful chop)
        if (result.woodYielded) {
            this.createChoppingEffect(tree, result.woodYielded);
        }

        // Tree fade out is handled in tree.update() when stage is GONE

        return result;
    }

    // Create floating "+1" effect for chopped tree
    createChoppingEffect(tree, woodTileId) {
        const tileSize = this.tilemap.tileSize;
        const centerX = (tree.tileX + tree.treeType.width / 2) * tileSize;
        const centerY = tree.tileY * tileSize;
        this.effects.push(createHarvestEffect(centerX, centerY, woodTileId));
        log.debug(`+1 wood from ${tree.treeType.name}!`);
    }

    // update() and _cleanupGone() inherited from ResourceManager

    // Get all trees for depth-sorted rendering
    getTrees() {
        return this.trees;
    }

    // Render a single tree (for depth-sorted rendering)
    renderTree(ctx, tree) {
        if (tree.isGone) return;
        const tileSize = this.tilemap.tileSize;
        const tiles = tree.getTilesForRender();
        if (tiles.length === 0) return;

        this._withAlpha(ctx, tree.alpha, () => {
            for (const tile of tiles) {
                const src = this.tilemap.getTilesetSourceRect(tile.id);
                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    src.x, src.y, src.width, src.height,
                    tile.x * tileSize, tile.y * tileSize, tileSize, tileSize
                );
            }
        });
    }

    // renderEffects() inherited from ResourceManager

    getTreeCount() {
        let count = 0;
        for (const tree of this.trees) { if (!tree.isGone) count++; }
        return count;
    }

    // Check if a tile is blocked by a tree trunk (for pathfinding)
    // Trunk row is one above the shadow/base row (tileY - 1)
    isTreeObstacle(tileX, tileY) {
        for (const tree of this.trees) {
            if (tree.isGone) continue;
            const trunkY = tree.tileY - 1;
            if (tileY !== trunkY) continue;
            for (let x = 0; x < tree.treeType.width; x++) {
                if (tileX === tree.tileX + x) return true;
            }
        }
        return false;
    }

    // Get all base tile positions currently occupied by trees
    getOccupiedBaseTiles() {
        const occupied = new Set();
        for (const tree of this.trees) {
            if (tree.isGone) continue;
            const basePositions = tree.getBaseTilePositions();
            for (const pos of basePositions) {
                occupied.add(`${pos.x},${pos.y}`);
            }
        }
        return occupied;
    }
}
