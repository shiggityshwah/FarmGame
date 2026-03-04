import { Crop, CROP_TYPES, getCropTypeByIndex } from './Crop.js';
import { Logger } from './Logger.js';
import { createHarvestEffect } from './EffectUtils.js';
import { ResourceManager } from './ResourceManager.js';

const log = Logger.create('CropManager');

export class CropManager extends ResourceManager {
    constructor(tilemap) {
        super(tilemap);
        this.crops = this.resources; // Alias for readability
        this.game = null;
    }

    setGame(game) {
        this.game = game;
    }

    // Returns a deltaTime multiplier based on the shrine's Fertile Soil upgrade level.
    // Level 1 = −15% growth time → advance timer 1/0.85× faster.
    // Level 2 = −30% growth time → advance timer 1/0.70× faster.
    _getGrowthSpeedMultiplier() {
        const lvl = this.game?.homeUpgrades?.shrineUpgrades?.fertileSoilLevel ?? 0;
        if (lvl >= 2) return 1 / 0.70;
        if (lvl >= 1) return 1 / 0.85;
        return 1.0;
    }

    // Plant a new crop at a tile position
    plantCrop(tileX, tileY, cropTypeIndex) {
        // Check if there's already a crop here
        if (this.getCropAt(tileX, tileY)) {
            log.debug(`Cannot plant at (${tileX}, ${tileY}) - crop already exists`);
            return null;
        }

        const cropType = getCropTypeByIndex(cropTypeIndex);
        const crop = new Crop(tileX, tileY, cropType, true); // true = start as planted
        this.crops.push(crop);

        log.debug(`Planted ${cropType.name} at (${tileX}, ${tileY})`);
        return crop;
    }

    // Water a crop at a tile position
    waterCrop(tileX, tileY) {
        const crop = this.getCropAt(tileX, tileY);
        if (crop && crop.wateringState === 'needs_water') {
            return crop.water();
        }
        return false;
    }

    spawnRandomCrops(count = 10) {
        const cropTypeKeys = Object.keys(CROP_TYPES);
        const usedPositions = new Set();

        for (let i = 0; i < count; i++) {
            // Get random position using tilemap's method (respects house boundaries)
            let position, posKey;
            let attempts = 0;

            do {
                position = this.tilemap.getRandomTilePosition();
                posKey = `${position.tileX},${position.tileY}`;
                attempts++;
            } while (usedPositions.has(posKey) && attempts < 100);

            if (attempts >= 100) continue;

            usedPositions.add(posKey);

            // Random crop type
            const randomType = cropTypeKeys[Math.floor(Math.random() * cropTypeKeys.length)];
            const cropType = CROP_TYPES[randomType];

            const crop = new Crop(position.tileX, position.tileY, cropType);
            this.crops.push(crop);
        }

        log.debug(`Spawned ${this.crops.length} crops`);
    }

    // Override _updateResources to apply shrine growth-speed multiplier.
    // The base update() still handles cleanup and effect ticking.
    _updateResources(deltaTime) {
        const effectiveDt = deltaTime * this._getGrowthSpeedMultiplier();
        for (const crop of this.crops) {
            crop.update(effectiveDt);
        }
    }

    render(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        // Render crops
        for (const crop of this.crops) {
            if (crop.isGone) continue;

            const tiles = crop.getTileIds();
            if (tiles.length === 0) continue;

            // Apply alpha for fading crops
            if (crop.alpha < 1) {
                ctx.save();
                ctx.globalAlpha = crop.alpha;
            }

            for (const tile of tiles) {
                const sourceRect = this.tilemap.getTilesetSourceRect(tile.id);
                const worldX = crop.tileX * tileSize;
                const worldY = (crop.tileY + tile.offsetY) * tileSize;

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }

            if (crop.alpha < 1) {
                ctx.restore();
            }
        }

        // Render harvest effects
        this.renderEffects(ctx, null);
    }

    // Try to harvest a crop at the given tile position
    tryHarvest(tileX, tileY) {
        for (const crop of this.crops) {
            if (crop.containsTile(tileX, tileY) && crop.isReadyToHarvest()) {
                const harvestedTileId = crop.getHarvestedTileId();
                crop.harvest();

                // Create harvest effect
                const tileSize = this.tilemap.tileSize;
                this.effects.push(createHarvestEffect(
                    crop.tileX * tileSize + tileSize / 2,
                    crop.tileY * tileSize,
                    harvestedTileId
                ));

                log.debug(`Harvested ${crop.cropType.name}!`);
                return crop.cropType;
            }
        }
        return null;
    }

    // Get crop at tile position (for hover effects, etc.)
    // Matches both base tile and the top sprite tile of tall crops.
    getCropAt(tileX, tileY) {
        for (const crop of this.crops) {
            // Skip harvested or gone crops
            if (crop.isHarvested || crop.isGone) continue;
            if (crop.containsTile(tileX, tileY)) {
                return crop;
            }
        }
        return null;
    }

    // Get crop whose BASE tile (the planted tile) is at the given position.
    // Unlike getCropAt, does NOT match the top sprite tile of tall crops —
    // the top sprite is visual only and should not block ground-level actions.
    getCropBaseAt(tileX, tileY) {
        for (const crop of this.crops) {
            if (crop.isHarvested || crop.isGone) continue;
            if (crop.tileX === tileX && crop.tileY === tileY) return crop;
        }
        return null;
    }

    // Get all crops for depth-sorted rendering
    getCrops() {
        return this.crops;
    }

    // Render ground-level dirt tiles for all crops (pre-pass, before depth-sorted entities)
    renderAllCropGroundTiles(ctx) {
        const tileSize = this.tilemap.tileSize;
        for (const crop of this.crops) {
            if (crop.isGone) continue;
            const tiles = crop.getTileIds();
            if (tiles.length === 0) continue;

            if (crop.alpha < 1) {
                ctx.save();
                ctx.globalAlpha = crop.alpha;
            }

            for (const tile of tiles) {
                if (!tile.isGround) continue;
                const sourceRect = this.tilemap.getTilesetSourceRect(tile.id);
                const worldX = crop.tileX * tileSize;
                const worldY = (crop.tileY + tile.offsetY) * tileSize;
                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }

            if (crop.alpha < 1) {
                ctx.restore();
            }
        }
    }

    // Render a single crop sprite (for depth-sorted rendering) — skips ground tiles
    renderCrop(ctx, crop) {
        if (crop.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tiles = crop.getTileIds();
        if (tiles.length === 0) return;

        // Check if there are any non-ground tiles to draw
        const hasNonGround = tiles.some(t => !t.isGround);
        if (!hasNonGround) return;

        // Apply alpha for fading crops
        if (crop.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = crop.alpha;
        }

        for (const tile of tiles) {
            if (tile.isGround) continue;
            const sourceRect = this.tilemap.getTilesetSourceRect(tile.id);
            const worldX = crop.tileX * tileSize;
            const worldY = (crop.tileY + tile.offsetY) * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (crop.alpha < 1) {
            ctx.restore();
        }
    }

    // renderEffects() inherited from ResourceManager
}
