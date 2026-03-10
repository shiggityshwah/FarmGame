import { OreVein, ORE_TYPES, MINING_STAGE, getRandomOreType } from './OreVein.js';
import { Logger } from './Logger.js';
import { createHarvestEffect } from './EffectUtils.js';
import { ResourceManager } from './ResourceManager.js';

const log = Logger.create('OreManager');

export class OreManager extends ResourceManager {
    constructor(tilemap) {
        super(tilemap);
        this.oreVeins = this.resources; // Alias for readability
    }

    // Spawn an ore vein at a specific tile position (top-left of 2x2)
    spawnOre(tileX, tileY, oreType = null) {
        // Use random ore type if not specified
        if (!oreType) {
            oreType = getRandomOreType();
        }

        const ore = new OreVein(tileX, tileY, oreType);
        this.oreVeins.push(ore);

        log.debug(`Spawned ${oreType.name} ore at (${tileX}, ${tileY})`);
        return ore;
    }

    // Spawn random ore veins in the grass area
    spawnRandomOres(count = 1) {
        const usedPositions = new Set();

        for (let i = 0; i < count; i++) {
            let tileX, tileY, posKey;
            let attempts = 0;

            do {
                // Get a random position, but ensure we have room for 2x2 ore
                const pos = this.tilemap.getRandomTilePosition();
                // Adjust to leave room for 2x2 ore (don't spawn at right or bottom edge)
                tileX = Math.min(pos.tileX, this.tilemap.mapWidth - 2);
                tileY = Math.min(pos.tileY, this.tilemap.mapHeight - 2);

                // Make sure we're still in the grass area (below house)
                const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
                if (tileY < grassStartY) {
                    tileY = grassStartY;
                }

                posKey = `${tileX},${tileY}`;
                attempts++;
            } while (usedPositions.has(posKey) && attempts < 100);

            if (attempts >= 100) continue;

            // Mark all 4 tiles as used
            usedPositions.add(`${tileX},${tileY}`);
            usedPositions.add(`${tileX + 1},${tileY}`);
            usedPositions.add(`${tileX},${tileY + 1}`);
            usedPositions.add(`${tileX + 1},${tileY + 1}`);

            this.spawnOre(tileX, tileY);
        }

        log.debug(`Spawned ${this.oreVeins.length} ore veins`);
    }

    // Get ore vein at a tile position (checks all 4 tiles of each ore)
    getOreAt(tileX, tileY) { return this.getResourceAt(tileX, tileY); }

    // Mine an ore vein at a tile position
    mineOre(tileX, tileY) {
        const ore = this.getOreAt(tileX, tileY);
        if (!ore || !ore.canBeMined()) {
            return null;
        }

        const result = ore.mine();

        // Create mining effect if ore was yielded
        if (result.oreYielded) {
            this.createMiningEffect(ore, result.oreYielded);
        }

        return result;
    }

    // Create floating "+1" effect for mined ore
    createMiningEffect(ore, oreTileId) {
        const tileSize = this.tilemap.tileSize;
        const centerX = (ore.tileX + 1) * tileSize;
        const centerY = (ore.tileY + 1) * tileSize;
        this.effects.push(createHarvestEffect(centerX, centerY, oreTileId));
        log.debug(`+1 ${ore.oreType.name} ore!`);
    }

    // update() and _cleanupGone() inherited from ResourceManager

    render(ctx, camera) {
        for (const ore of this.oreVeins) {
            if (!ore.isGone) this.renderOre(ctx, ore);
        }
        this.renderEffects(ctx, null);
    }

    // Check if a tile is blocked by the bottom row of an ore vein (for pathfinding)
    // Ore veins are 2x2; only the bottom tiles (tileY + 1) act as obstacles
    isOreObstacle(tileX, tileY) {
        for (const ore of this.oreVeins) {
            if (ore.isGone) continue;
            if (tileY === ore.tileY + 1 && (tileX === ore.tileX || tileX === ore.tileX + 1)) {
                return true;
            }
        }
        return false;
    }

    getOreCount() {
        let count = 0;
        for (const ore of this.oreVeins) { if (!ore.isGone) count++; }
        return count;
    }

    // Get all ore veins for depth-sorted rendering
    getOreVeins() {
        return this.oreVeins;
    }

    // Render a single ore vein (for depth-sorted rendering)
    renderOre(ctx, ore) {
        if (ore.isGone) return;
        const tileSize = this.tilemap.tileSize;
        const tileIds = ore.getTileIds();
        if (tileIds.length === 0) return;

        // 2x2 tile positions (top-left, top-right, bottom-left, bottom-right)
        const ox = ore.tileX, oy = ore.tileY;
        const positions = [
            { x: ox,     y: oy },
            { x: ox + 1, y: oy },
            { x: ox,     y: oy + 1 },
            { x: ox + 1, y: oy + 1 },
        ];

        this._withAlpha(ctx, ore.alpha, () => {
            for (let i = 0; i < 4 && i < tileIds.length; i++) {
                const src = this.tilemap.getTilesetSourceRect(tileIds[i]);
                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    src.x, src.y, src.width, src.height,
                    positions[i].x * tileSize, positions[i].y * tileSize, tileSize, tileSize
                );
            }
        });
    }

    // renderEffects() inherited from ResourceManager
}
