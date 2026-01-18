import { Tree, TREE_TYPES, CHOP_STAGE, getRandomTreeType } from './Tree.js';

export class TreeManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.trees = [];
        this.choppingEffects = []; // Floating "+1 wood" effects
    }

    // Spawn a tree at a specific tile position (bottom-left base tile)
    spawnTree(tileX, tileY, treeType = null) {
        if (!treeType) {
            treeType = getRandomTreeType();
        }

        const tree = new Tree(tileX, tileY, treeType);
        this.trees.push(tree);

        console.log(`Spawned ${treeType.name} at base (${tileX}, ${tileY})`);
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

        console.log(`Spawned ${this.trees.length} trees`);
        return localOccupied;
    }

    // Get tree at a tile position (checks all tiles of each tree)
    getTreeAt(tileX, tileY) {
        for (const tree of this.trees) {
            if (tree.isGone) continue;
            if (tree.containsTile(tileX, tileY)) {
                return tree;
            }
        }
        return null;
    }

    // Chop a tree at a tile position
    chopTree(tileX, tileY) {
        const tree = this.getTreeAt(tileX, tileY);
        if (!tree || !tree.canBeChopped()) {
            return null;
        }

        const result = tree.chop();

        // Create chopping effect if wood was yielded
        if (result.woodYielded) {
            this.createChoppingEffect(tree, result.woodYielded);
        }

        // If tree became a stump (stage STUMP), continue chopping to remove it
        if (tree.stage === CHOP_STAGE.STUMP) {
            // The stump can still be chopped
        }

        // If tree is now GONE, start fade out
        if (tree.stage === CHOP_STAGE.GONE) {
            // Fade handled in tree.update()
        }

        return result;
    }

    // Create floating "+1" effect for chopped tree
    createChoppingEffect(tree, woodTileId) {
        const tileSize = this.tilemap.tileSize;
        // Position at center of tree base
        const centerX = (tree.tileX + tree.treeType.width / 2) * tileSize;
        const centerY = tree.tileY * tileSize;

        this.choppingEffects.push({
            x: centerX,
            y: centerY,
            tileId: woodTileId,
            timer: 0,
            duration: 1000, // 1 second effect
            alpha: 1,
            treeName: tree.treeType.name
        });

        console.log(`+1 wood from ${tree.treeType.name}!`);
    }

    update(deltaTime) {
        // Update trees
        for (const tree of this.trees) {
            tree.update(deltaTime);
        }

        // Clean up gone trees
        this.trees = this.trees.filter(tree => !tree.isGone);

        // Update chopping effects
        for (let i = this.choppingEffects.length - 1; i >= 0; i--) {
            const effect = this.choppingEffects[i];
            effect.timer += deltaTime;
            effect.y -= deltaTime * 0.05; // Float upward
            effect.alpha = 1 - (effect.timer / effect.duration);

            if (effect.timer >= effect.duration) {
                this.choppingEffects.splice(i, 1);
            }
        }
    }

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

        // Apply alpha for fading trees
        if (tree.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = tree.alpha;
        }

        // Render all tiles of the tree
        for (const tile of tiles) {
            const sourceRect = this.tilemap.getTilesetSourceRect(tile.id);
            const worldX = tile.x * tileSize;
            const worldY = tile.y * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (tree.alpha < 1) {
            ctx.restore();
        }
    }

    // Render only the chopping effects (rendered after all entities)
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        for (const effect of this.choppingEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            // Draw the wood icon floating up
            const sourceRect = this.tilemap.getTilesetSourceRect(effect.tileId);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                effect.x - tileSize / 2, effect.y - tileSize / 2,
                tileSize, tileSize
            );

            // Draw "+1" text
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText('+1', effect.x, effect.y - tileSize / 2 - 2);
            ctx.fillText('+1', effect.x, effect.y - tileSize / 2 - 2);

            ctx.restore();
        }
    }

    getTreeCount() {
        return this.trees.filter(tree => !tree.isGone).length;
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
