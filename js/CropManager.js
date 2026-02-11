import { Crop, CROP_TYPES, GROWTH_STAGE, getCropTypeByIndex } from './Crop.js';
import { Logger } from './Logger.js';

const log = Logger.create('CropManager');

export class CropManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.crops = [];
        this.harvestEffects = [];
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
        if (crop && !crop.isWatered) {
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

    update(deltaTime) {
        // Update crop growth
        for (const crop of this.crops) {
            crop.update(deltaTime);
        }

        // Clean up crops that have completely faded away
        this.cleanupGoneCrops();

        // Update harvest effects
        for (let i = this.harvestEffects.length - 1; i >= 0; i--) {
            const effect = this.harvestEffects[i];
            effect.timer += deltaTime;
            effect.y -= deltaTime * 0.05; // Float upward
            effect.alpha = 1 - (effect.timer / effect.duration);

            if (effect.timer >= effect.duration) {
                this.harvestEffects.splice(i, 1);
            }
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
        for (const effect of this.harvestEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            // Draw the harvested crop icon floating up
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

    // Try to harvest a crop at the given tile position
    tryHarvest(tileX, tileY) {
        for (const crop of this.crops) {
            if (crop.containsTile(tileX, tileY) && crop.isReadyToHarvest()) {
                const harvestedTileId = crop.getHarvestedTileId();
                crop.harvest();

                // Create harvest effect
                const tileSize = this.tilemap.tileSize;
                this.harvestEffects.push({
                    x: crop.tileX * tileSize + tileSize / 2,
                    y: crop.tileY * tileSize,
                    tileId: harvestedTileId,
                    timer: 0,
                    duration: 1000, // 1 second effect
                    alpha: 1
                });

                log.debug(`Harvested ${crop.cropType.name}!`);
                return crop.cropType;
            }
        }
        return null;
    }

    // Get crop at tile position (for hover effects, etc.)
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

    // Clean up crops that have completely faded away
    cleanupGoneCrops() {
        this.crops = this.crops.filter(crop => !crop.isGone);
    }

    // Get all crops for depth-sorted rendering
    getCrops() {
        return this.crops;
    }

    // Render a single crop (for depth-sorted rendering)
    renderCrop(ctx, crop) {
        if (crop.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tiles = crop.getTileIds();
        if (tiles.length === 0) return;

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

    // Render only the harvest effects (rendered after all entities)
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        for (const effect of this.harvestEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            // Draw the harvested crop icon floating up
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
