import { OreVein, ORE_TYPES, MINING_STAGE, getRandomOreType } from './OreVein.js';
import { Logger } from './Logger.js';

const log = Logger.create('OreManager');

export class OreManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.oreVeins = [];
        this.miningEffects = []; // Floating "+1 ore" effects
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
    getOreAt(tileX, tileY) {
        for (const ore of this.oreVeins) {
            if (ore.isGone) continue;
            if (ore.containsTile(tileX, tileY)) {
                return ore;
            }
        }
        return null;
    }

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
        // Position at center of the 2x2 ore vein
        const centerX = (ore.tileX + 1) * tileSize;
        const centerY = (ore.tileY + 1) * tileSize;

        this.miningEffects.push({
            x: centerX,
            y: centerY,
            tileId: oreTileId,
            timer: 0,
            duration: 1000, // 1 second effect
            alpha: 1,
            oreName: ore.oreType.name
        });

        log.debug(`+1 ${ore.oreType.name} ore!`);
    }

    update(deltaTime) {
        // Update ore veins
        for (const ore of this.oreVeins) {
            ore.update(deltaTime);
        }

        // Clean up gone ore veins
        this.oreVeins = this.oreVeins.filter(ore => !ore.isGone);

        // Update mining effects
        for (let i = this.miningEffects.length - 1; i >= 0; i--) {
            const effect = this.miningEffects[i];
            effect.timer += deltaTime;
            effect.y -= deltaTime * 0.05; // Float upward
            effect.alpha = 1 - (effect.timer / effect.duration);

            if (effect.timer >= effect.duration) {
                this.miningEffects.splice(i, 1);
            }
        }
    }

    render(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        // Render ore veins
        for (const ore of this.oreVeins) {
            if (ore.isGone) continue;

            const tileIds = ore.getTileIds();
            if (tileIds.length === 0) continue;

            // Apply alpha for fading ores
            if (ore.alpha < 1) {
                ctx.save();
                ctx.globalAlpha = ore.alpha;
            }

            // Render 2x2 tiles
            const positions = [
                { x: ore.tileX, y: ore.tileY },         // top-left
                { x: ore.tileX + 1, y: ore.tileY },     // top-right
                { x: ore.tileX, y: ore.tileY + 1 },     // bottom-left
                { x: ore.tileX + 1, y: ore.tileY + 1 }  // bottom-right
            ];

            for (let i = 0; i < 4 && i < tileIds.length; i++) {
                const sourceRect = this.tilemap.getTilesetSourceRect(tileIds[i]);
                const worldX = positions[i].x * tileSize;
                const worldY = positions[i].y * tileSize;

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }

            if (ore.alpha < 1) {
                ctx.restore();
            }
        }

        // Render mining effects
        for (const effect of this.miningEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            // Draw the ore icon floating up
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

    getOreCount() {
        return this.oreVeins.filter(ore => !ore.isGone).length;
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

        // Apply alpha for fading ores
        if (ore.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = ore.alpha;
        }

        // Render 2x2 tiles
        const positions = [
            { x: ore.tileX, y: ore.tileY },         // top-left
            { x: ore.tileX + 1, y: ore.tileY },     // top-right
            { x: ore.tileX, y: ore.tileY + 1 },     // bottom-left
            { x: ore.tileX + 1, y: ore.tileY + 1 }  // bottom-right
        ];

        for (let i = 0; i < 4 && i < tileIds.length; i++) {
            const sourceRect = this.tilemap.getTilesetSourceRect(tileIds[i]);
            const worldX = positions[i].x * tileSize;
            const worldY = positions[i].y * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (ore.alpha < 1) {
            ctx.restore();
        }
    }

    // Render only the mining effects (rendered after all entities)
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        for (const effect of this.miningEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            // Draw the ore icon floating up
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
}
