import { Flower, FLOWER_TYPES, getRandomFlowerType, getRandomFlowerTile } from './Flower.js';
import { Weed, WEED_STAGES } from './Weed.js';

export class FlowerManager {
    constructor(tilemap, overlayManager) {
        this.tilemap = tilemap;
        this.overlayManager = overlayManager;
        this.flowers = [];
        this.weeds = [];
        this.harvestEffects = [];
        this.weedClickEffects = []; // Leaf splash effects when clicking weeds

        // Spawning configuration
        // Average 1 flower/weed per 5 seconds for every 50 tiles in the grass area
        this.spawnRatePerTile = 1 / (5000 * 50); // flowers/weeds per ms per tile
        this.spawnTimer = 0;
        this.maxFlowers = 100; // Prevent too many flowers/weeds

        // Grass tile IDs that flowers can spawn on
        this.grassTileIds = new Set([
            65, 66, 129, 130, 131, 132, 133, 134,
            192, 193, 194, 195, 197, 199, 257, 258
        ]);

        // Dirt/hoed tile IDs that flowers cannot spawn on
        this.hoedTileIds = new Set([67, 449, 457, 458, 459, 521, 522]);
    }

    // Set the crop manager reference for checking occupied tiles
    setCropManager(cropManager) {
        this.cropManager = cropManager;
    }

    // Set the tree manager reference for checking occupied tiles
    setTreeManager(treeManager) {
        this.treeManager = treeManager;
    }

    // Set the ore manager reference for checking occupied tiles
    setOreManager(oreManager) {
        this.oreManager = oreManager;
    }

    // Set the enemy manager reference for checking occupied tiles
    setEnemyManager(enemyManager) {
        this.enemyManager = enemyManager;
    }

    // Set the forest generator reference for checking forest tiles
    setForestGenerator(forestGenerator) {
        this.forestGenerator = forestGenerator;
    }

    // Calculate the number of grass tiles in the spawnable area (unhoed grass only)
    getGrassTileCount() {
        let count = 0;
        const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;

        // Count main tilemap grass tiles
        for (let y = grassStartY; y < this.tilemap.mapHeight; y++) {
            for (let x = 0; x < this.tilemap.mapWidth; x++) {
                const tileId = this.tilemap.getTileAt(x, y);
                if (this.grassTileIds.has(tileId)) {
                    count++;
                }
            }
        }

        // Count forest grass tiles
        if (this.forestGenerator) {
            const forestTiles = this.forestGenerator.getForestGrassTiles();
            count += forestTiles.length;
        }

        return count;
    }

    // Get the count of active (non-harvested) flowers and weeds
    getActiveFlowerCount() {
        const flowerCount = this.flowers.filter(f => !f.isGone && !f.isHarvested).length;
        const weedCount = this.weeds.filter(w => !w.isGone && !w.isRemoved).length;
        return flowerCount + weedCount;
    }

    // Calculate spawn probability multiplier based on flower coverage
    // Returns 1.0 when no flowers, approaches 0 as flowers fill available space
    getSpawnProbabilityMultiplier() {
        const grassTileCount = this.getGrassTileCount();
        if (grassTileCount === 0) return 0;

        const flowerCount = this.getActiveFlowerCount();

        // Calculate the ratio of flowers to grass tiles
        const coverageRatio = flowerCount / grassTileCount;

        // Use a curve that starts at 1.0 and decreases as coverage increases
        // When coverageRatio = 0, multiplier = 1.0 (full spawn rate)
        // When coverageRatio = 1, multiplier = 0 (no spawning)
        // Using (1 - ratio)^2 for a smooth curve that slows down more as it fills
        const multiplier = Math.pow(1 - coverageRatio, 2);

        return Math.max(0, multiplier);
    }

    // Check if a tile is valid for flower spawning
    isValidSpawnTile(tileX, tileY, isForestTile = false) {
        // For forest tiles, use the forest generator's validation
        if (isForestTile) {
            if (!this.forestGenerator) return false;
            if (!this.forestGenerator.isValidForestSpawnTile(tileX, tileY)) return false;

            // Check for existing flower or weed at this location
            if (this.getFlowerAt(tileX, tileY) || this.getWeedAt(tileX, tileY)) {
                return false;
            }

            return true;
        }

        // For main tilemap tiles:
        // Check tile is in bounds
        if (tileX < 0 || tileX >= this.tilemap.mapWidth ||
            tileY < 0 || tileY >= this.tilemap.mapHeight) {
            return false;
        }

        // Must be in the grass area (below house)
        const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
        if (tileY < grassStartY) {
            return false;
        }

        // Check base tile is grass (not hoed)
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (!this.grassTileIds.has(tileId)) {
            return false;
        }

        // Check for existing flower or weed at this location
        if (this.getFlowerAt(tileX, tileY) || this.getWeedAt(tileX, tileY)) {
            return false;
        }

        // Check for overlay (holes, etc.)
        if (this.overlayManager && this.overlayManager.hasOverlay(tileX, tileY)) {
            return false;
        }

        // Check for crops
        if (this.cropManager && this.cropManager.getCropAt(tileX, tileY)) {
            return false;
        }

        // Check for trees
        if (this.treeManager && this.treeManager.getTreeAt(tileX, tileY)) {
            return false;
        }

        // Check for ore veins
        if (this.oreManager && this.oreManager.getOreAt(tileX, tileY)) {
            return false;
        }

        return true;
    }

    // Spawn a flower at a random valid location (main tilemap or forest)
    spawnRandomFlower() {
        if (this.flowers.length + this.weeds.length >= this.maxFlowers) {
            return null;
        }

        // Get forest tiles if available
        const forestTiles = this.forestGenerator ? this.forestGenerator.getForestGrassTiles() : [];

        // Calculate main tilemap grass area
        const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
        const grassHeight = this.tilemap.mapHeight - grassStartY;
        const mainTileCount = this.tilemap.mapWidth * grassHeight;

        // Decide whether to spawn in forest or main area based on relative size
        const totalTiles = mainTileCount + forestTiles.length;
        const spawnInForest = forestTiles.length > 0 && Math.random() < (forestTiles.length / totalTiles);

        let attempts = 0;
        const maxAttempts = 50;

        if (spawnInForest) {
            // Try to spawn in forest
            while (attempts < maxAttempts) {
                const idx = Math.floor(Math.random() * forestTiles.length);
                const tile = forestTiles[idx];

                if (this.isValidSpawnTile(tile.x, tile.y, true)) {
                    return this.spawnFlower(tile.x, tile.y);
                }

                attempts++;
            }
        } else {
            // Try to spawn in main tilemap
            while (attempts < maxAttempts) {
                const tileX = Math.floor(Math.random() * this.tilemap.mapWidth);
                const tileY = grassStartY + Math.floor(Math.random() * grassHeight);

                if (this.isValidSpawnTile(tileX, tileY)) {
                    return this.spawnFlower(tileX, tileY);
                }

                attempts++;
            }
        }

        return null;
    }

    // Spawn a weed at a random valid location (main tilemap or forest)
    spawnRandomWeed() {
        if (this.flowers.length + this.weeds.length >= this.maxFlowers) {
            return null;
        }

        // Get forest tiles if available
        const forestTiles = this.forestGenerator ? this.forestGenerator.getForestGrassTiles() : [];

        // Calculate main tilemap grass area
        const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
        const grassHeight = this.tilemap.mapHeight - grassStartY;
        const mainTileCount = this.tilemap.mapWidth * grassHeight;

        // Decide whether to spawn in forest or main area based on relative size
        const totalTiles = mainTileCount + forestTiles.length;
        const spawnInForest = forestTiles.length > 0 && Math.random() < (forestTiles.length / totalTiles);

        let attempts = 0;
        const maxAttempts = 50;

        if (spawnInForest) {
            // Try to spawn in forest
            while (attempts < maxAttempts) {
                const idx = Math.floor(Math.random() * forestTiles.length);
                const tile = forestTiles[idx];

                if (this.isValidSpawnTile(tile.x, tile.y, true)) {
                    return this.spawnWeed(tile.x, tile.y);
                }

                attempts++;
            }
        } else {
            // Try to spawn in main tilemap
            while (attempts < maxAttempts) {
                const tileX = Math.floor(Math.random() * this.tilemap.mapWidth);
                const tileY = grassStartY + Math.floor(Math.random() * grassHeight);

                if (this.isValidSpawnTile(tileX, tileY)) {
                    return this.spawnWeed(tileX, tileY);
                }

                attempts++;
            }
        }

        return null;
    }

    // Spawn a flower at a specific location
    spawnFlower(tileX, tileY) {
        const flowerType = getRandomFlowerType();
        const tileId = getRandomFlowerTile(flowerType);

        const flower = new Flower(tileX, tileY, flowerType, tileId);
        this.flowers.push(flower);
        return flower;
    }

    // Spawn a weed at a specific location (always starts at stage 1)
    spawnWeed(tileX, tileY) {
        const weed = new Weed(tileX, tileY); // Always starts at stage 1
        this.weeds.push(weed);
        return weed;
    }

    // Get flower at a specific tile position
    getFlowerAt(tileX, tileY) {
        for (const flower of this.flowers) {
            if (flower.isGone || flower.isHarvested) continue;
            if (flower.containsTile(tileX, tileY)) {
                return flower;
            }
        }
        return null;
    }

    // Get weed at a specific tile position
    getWeedAt(tileX, tileY) {
        for (const weed of this.weeds) {
            if (weed.isGone || weed.isRemoved) continue;
            if (weed.containsTile(tileX, tileY)) {
                return weed;
            }
        }
        return null;
    }

    // Try to harvest a flower at the given tile position
    tryHarvest(tileX, tileY) {
        const flower = this.getFlowerAt(tileX, tileY);
        if (!flower || flower.isHarvested) {
            return null;
        }

        const yield_ = flower.harvest();
        const tileSize = this.tilemap.tileSize;

        // Create harvest effect(s)
        for (let i = 0; i < yield_; i++) {
            this.harvestEffects.push({
                x: flower.tileX * tileSize + tileSize / 2 + (i * 8 - (yield_ - 1) * 4),
                y: flower.tileY * tileSize,
                tileId: flower.flowerType.harvestIcon,
                timer: 0,
                duration: 1000,
                alpha: 1
            });
        }

        return { flowerType: flower.flowerType, yield: yield_ };
    }

    // Update spawning and flower states
    update(deltaTime) {
        // Calculate base spawn rate based on grass tile count
        const grassTileCount = this.getGrassTileCount();

        // Only attempt spawning if there are grass tiles available
        if (grassTileCount > 0) {
            // Get spawn probability multiplier based on current flower coverage
            // This makes flowers spawn faster when there are fewer, slower as map fills up
            const spawnMultiplier = this.getSpawnProbabilityMultiplier();

            // Apply multiplier to spawn rate
            const adjustedSpawnRate = this.spawnRatePerTile * spawnMultiplier;
            const spawnChancePerMs = adjustedSpawnRate * grassTileCount;

            // Skip spawning if multiplier is effectively zero
            if (spawnChancePerMs <= 0) {
                this.spawnTimer = 0;
            } else {
                // Accumulate time and potentially spawn flowers
                this.spawnTimer += deltaTime;

                // Average spawn time in ms
                const avgSpawnTime = 1 / spawnChancePerMs;

                // Use probabilistic spawning based on elapsed time
            // Flowers spawn at 25% of original rate, weeds at 75% of original rate
            while (this.spawnTimer >= avgSpawnTime) {
                this.spawnTimer -= avgSpawnTime;
                // Random chance to actually spawn (for more natural distribution)
                if (Math.random() < 0.5 + Math.random() * 0.5) {
                    // 75% chance to spawn weed, 25% chance to spawn flower
                    const rand = Math.random();
                    if (rand < 0.75) {
                        this.spawnRandomWeed();
                    } else {
                        this.spawnRandomFlower();
                    }
                }
            }
            }
        }

        // Update flower states (fade out harvested flowers)
        for (const flower of this.flowers) {
            flower.update(deltaTime);
        }

        // Update weed states (growth and fade out removed weeds)
        for (const weed of this.weeds) {
            weed.update(deltaTime);
        }

        // Clean up gone flowers and weeds
        this.flowers = this.flowers.filter(f => !f.isGone);
        this.weeds = this.weeds.filter(w => !w.isGone);

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

        // Update weed click effects (leaf splash)
        for (let i = this.weedClickEffects.length - 1; i >= 0; i--) {
            const effect = this.weedClickEffects[i];
            effect.timer += deltaTime;
            
            // Update position
            effect.x += effect.vx * (deltaTime / 16); // Normalize to 60fps
            effect.y += effect.vy * (deltaTime / 16);
            
            // Apply lighter gravity (smaller effect)
            effect.vy += 0.15 * (deltaTime / 16);
            
            // Update rotation
            effect.rotation += effect.rotationSpeed * (deltaTime / 16);
            
            // Fade out
            effect.alpha = 1 - (effect.timer / effect.duration);
            
            // Shrink slightly
            effect.size *= 0.998;

            if (effect.timer >= effect.duration || effect.alpha <= 0) {
                this.weedClickEffects.splice(i, 1);
            }
        }
    }

    // Render all flowers and weeds
    render(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        // Render flowers
        for (const flower of this.flowers) {
            if (flower.isGone) continue;

            const tileData = flower.getTileData();
            const sourceRect = this.tilemap.getTilesetSourceRect(tileData.id);
            const worldX = flower.tileX * tileSize;
            const worldY = (flower.tileY + tileData.offsetY) * tileSize;

            if (flower.alpha < 1) {
                ctx.save();
                ctx.globalAlpha = flower.alpha;
            }

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );

            if (flower.alpha < 1) {
                ctx.restore();
            }
        }

        // Render weeds
        for (const weed of this.weeds) {
            if (weed.isGone) continue;

            const tileDataArray = weed.getTileData(); // Returns array of tiles
            const worldX = weed.tileX * tileSize;

            if (weed.alpha < 1) {
                ctx.save();
                ctx.globalAlpha = weed.alpha;
            }

            // Render all tiles for this weed (multi-tile weeds have multiple tiles)
            for (const tileData of tileDataArray) {
                const sourceRect = this.tilemap.getTilesetSourceRect(tileData.id);
                const worldY = (weed.tileY + tileData.offsetY) * tileSize;

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }

            if (weed.alpha < 1) {
                ctx.restore();
            }
        }
    }

    // Render a single flower (for depth-sorted rendering)
    renderFlower(ctx, flower) {
        if (flower.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tileData = flower.getTileData();
        const sourceRect = this.tilemap.getTilesetSourceRect(tileData.id);
        const worldX = flower.tileX * tileSize;
        const worldY = (flower.tileY + tileData.offsetY) * tileSize;

        if (flower.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = flower.alpha;
        }

        ctx.drawImage(
            this.tilemap.tilesetImage,
            sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
            worldX, worldY, tileSize, tileSize
        );

        if (flower.alpha < 1) {
            ctx.restore();
        }
    }

    // Render a single weed (for depth-sorted rendering)
    renderWeed(ctx, weed) {
        if (weed.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tileDataArray = weed.getTileData(); // Returns array of tiles
        const worldX = weed.tileX * tileSize;

        if (weed.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = weed.alpha;
        }

        // Render all tiles for this weed (multi-tile weeds have multiple tiles)
        for (const tileData of tileDataArray) {
            const sourceRect = this.tilemap.getTilesetSourceRect(tileData.id);
            const worldY = (weed.tileY + tileData.offsetY) * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (weed.alpha < 1) {
            ctx.restore();
        }
    }

    // Render harvest effects
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        for (const effect of this.harvestEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            const sourceRect = this.tilemap.getTilesetSourceRect(effect.tileId);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                effect.x - tileSize / 2, effect.y - tileSize / 2,
                tileSize, tileSize
            );

            // Draw "+1" or "+2" text
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            const text = '+1';
            ctx.strokeText(text, effect.x, effect.y - tileSize / 2 - 2);
            ctx.fillText(text, effect.x, effect.y - tileSize / 2 - 2);

            ctx.restore();
        }

        // Render weed click effects (leaf splash)
        for (const effect of this.weedClickEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;
            ctx.translate(effect.x, effect.y);
            ctx.rotate(effect.rotation);
            
            // Draw leaf shape (simple oval/leaf shape)
            ctx.fillStyle = effect.color;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            
            // Draw a leaf shape (oval with a point)
            ctx.beginPath();
            ctx.ellipse(0, 0, effect.size, effect.size * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Add a small stem/vein
            ctx.beginPath();
            ctx.moveTo(0, -effect.size);
            ctx.lineTo(0, effect.size);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            ctx.restore();
        }
    }

    // Get all flowers for depth-sorted rendering
    getFlowers() {
        return this.flowers;
    }

    // Get all weeds for depth-sorted rendering
    getWeeds() {
        return this.weeds;
    }

    // Try to click/remove a weed at the given tile position
    // Returns true if weed was removed, false if it needs more clicks
    tryRemoveWeed(tileX, tileY) {
        const weed = this.getWeedAt(tileX, tileY);
        if (!weed || weed.isRemoved) {
            return null;
        }

        const oldStage = weed.stage;
        const wasRemoved = weed.click();
        
        // Create leaf splash effect
        this.createLeafSplashEffect(tileX, tileY);
        
        return { removed: wasRemoved, stage: weed.stage };
    }

    // Create a leaf splash effect when clicking a weed
    createLeafSplashEffect(tileX, tileY) {
        const tileSize = this.tilemap.tileSize;
        const centerX = tileX * tileSize + tileSize / 2;
        const centerY = tileY * tileSize + tileSize / 2;
        
        // Create 4-6 leaf particles (smaller count)
        const particleCount = 4 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
            const speed = 0.75 + Math.random() * 1.25; // Quarter size (was 3-8, now 0.75-2)
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            this.weedClickEffects.push({
                x: centerX,
                y: centerY,
                vx: vx,
                vy: vy,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.15,
                size: 0.75 + Math.random() * 0.75, // Quarter size (was 3-6, now 0.75-1.5)
                timer: 0,
                duration: 300 + Math.random() * 150, // 300-450ms (shorter duration)
                alpha: 1,
                color: `hsl(${100 + Math.random() * 40}, 70%, ${40 + Math.random() * 20}%)` // Green variations
            });
        }
    }
}
