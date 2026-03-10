import { Flower, FLOWER_TYPES, getRandomFlowerType, getRandomFlowerTile } from './Flower.js';
import { Weed, WEED_STAGES } from './Weed.js';
import { CONFIG } from './config.js';
import { withAlpha } from './EffectUtils.js';

export class FlowerManager {
    constructor(tilemap, overlayManager) {
        this.tilemap = tilemap;
        this.overlayManager = overlayManager;
        this.flowers = [];
        this.weeds = [];
        this.harvestEffects = [];
        this.weedClickEffects = []; // Leaf splash effects when clicking weeds
        // O(1) tile → flower lookup. Kept in sync with this.flowers on add/remove.
        this._flowerTileMap = new Map(); // "x,y" → Flower

        // Spawning configuration
        // Fixed global spawn interval — one spawn attempt every N ms at full rate.
        // Does NOT scale with tile count; density is regulated by getEffectiveMaxCount()
        // and getSpawnProbabilityMultiplier() instead.
        this.baseSpawnInterval = 15000; // ms between spawns at full rate (empty map)
        this.spawnTimer = 0;
        this.maxFlowers = CONFIG.flowers.maxCount;

        // Grass tile count cache — recomputed at most once every 5 seconds
        this._grassTileCount = -1;
        this._grassCountLastUpdate = -Infinity;

        // Grass tile IDs that flowers can spawn on (single source of truth: CONFIG.tiles.grass)
        this.grassTileIds = new Set(CONFIG.tiles.grass);

        // Dirt/hoed tile IDs that flowers cannot spawn on (CONFIG.tiles.hoedGround)
        this.hoedTileIds = new Set(CONFIG.tiles.hoedGround);
    }

    /** Inject multiple dependencies at once. Replaces individual setXxx() setters. */
    setDependencies(deps) { Object.assign(this, deps); }

    // Calculate the number of grass tiles in the spawnable area (unhoed grass only).
    // Result is cached for 5 seconds since this only changes when tiles are hoed.
    getGrassTileCount() {
        const now = performance.now();
        if (this._grassTileCount >= 0 && now - this._grassCountLastUpdate < 5000) {
            return this._grassTileCount;
        }

        let count = 0;
        const spawnAreas = this._getSpawnAreas();

        // Count main tilemap grass tiles across all spawn areas
        for (const area of spawnAreas) {
            for (let y = area.top; y < area.bottom; y++) {
                for (let x = area.left; x < area.right; x++) {
                    const tileId = this.tilemap.getTileAt(x, y);
                    if (this.grassTileIds.has(tileId)) {
                        count++;
                    }
                }
            }
        }

        // Count forest grass tiles
        if (this.forestGenerator) {
            const forestTiles = this.forestGenerator.getForestGrassTiles();
            count += forestTiles.length;
        }

        this._grassTileCount = count;
        this._grassCountLastUpdate = now;
        return count;
    }

    // Invalidate the grass tile count cache (call when tiles are hoed or restored)
    invalidateGrassCache() {
        this._grassTileCount = -1;
    }

    // Get the count of active (non-harvested) flowers and weeds
    getActiveFlowerCount() {
        let count = 0;
        for (const f of this.flowers) { if (!f.isGone && !f.isHarvested) count++; }
        for (const w of this.weeds) { if (!w.isGone && !w.isRemoved) count++; }
        return count;
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

        // Must be in one of the valid spawn areas (farm chunk grass or town chunk)
        const spawnAreas = this._getSpawnAreas();
        const inAnyArea = spawnAreas.some(a =>
            tileX >= a.left && tileX < a.right && tileY >= a.top && tileY < a.bottom
        );
        if (!inAnyArea) {
            return false;
        }

        // Exclude tiles covered by custom tilemaps (e.g. house.tmx)
        if (this.tilemap.isCustomTilemapTile(tileX, tileY)) {
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

        // Check for forest generator trees and pocket resources
        if (this.forestGenerator) {
            if (this.forestGenerator.trunkTileMap.has(`${tileX},${tileY}`)) return false;
            if (this.forestGenerator.pocketOccupiedTiles.has(`${tileX},${tileY}`)) return false;
        }

        return true;
    }

    // Returns the farm-chunk grass spawn bounds for main tilemap flowers/weeds
    _getFarmBounds() {
        const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
        if (this.tilemap.mapType === 'chunk') {
            const { farmCol, farmRow, mainPathGap, pathBoundaryRow, size: chunkSize } = CONFIG.chunks;
            const farmLeft   = farmCol * chunkSize;                                               // 15
            const farmRight  = farmLeft + chunkSize;                                              // 30
            const farmBottom = farmRow * chunkSize + (farmRow > pathBoundaryRow ? mainPathGap : 0) + chunkSize; // 49+15=64
            return { farmLeft, farmRight, grassStartY, farmBottom };
        }
        return { farmLeft: 0, farmRight: this.tilemap.mapWidth, grassStartY, farmBottom: this.tilemap.mapHeight };
    }

    // Returns spawn area rects for all valid spawn zones (farm chunk grass + owned + town chunks).
    // Cached until invalidateSpawnAreasCache() is called (e.g. on chunk purchase).
    _getSpawnAreas() {
        if (this._spawnAreasCache) return this._spawnAreasCache;

        const areas = [];
        const { farmLeft, farmRight, grassStartY, farmBottom } = this._getFarmBounds();
        areas.push({ left: farmLeft, right: farmRight, top: grassStartY, bottom: farmBottom });

        if (this.tilemap.mapType === 'chunk' && this.chunkManager) {
            const { farmCol, farmRow } = CONFIG.chunks;
            for (const [, chunk] of this.chunkManager.chunks) {
                // Skip the farm chunk — already added with grass-only bounds above
                if (chunk.col === farmCol && chunk.row === farmRow) continue;
                // Include all chunks regardless of state; isValidSpawnTile handles per-tile checks
                const bounds = this.chunkManager.getChunkBounds(chunk.col, chunk.row);
                areas.push({ left: bounds.x, right: bounds.x + bounds.width, top: bounds.y, bottom: bounds.y + bounds.height });
            }
        }

        this._spawnAreasCache = areas;
        return areas;
    }

    /** Invalidate the spawn area + grass count caches. Call on chunk purchase or map change. */
    invalidateSpawnAreasCache() {
        this._spawnAreasCache = null;
        this.invalidateGrassCache();
    }

    // Get the effective max flower+weed count, scaling with available grass tiles.
    // Targets ~1 plant per 5 grass tiles so density stays consistent across map sizes.
    getEffectiveMaxCount() {
        return Math.max(10, Math.ceil(this.getGrassTileCount() / 5));
    }

    // Spawn a flower at a random valid location (main tilemap or forest)
    spawnRandomFlower() {
        if (this.flowers.length + this.weeds.length >= this.getEffectiveMaxCount()) {
            return null;
        }

        // Get forest tiles and main tilemap spawn areas
        const forestTiles = this.forestGenerator ? this.forestGenerator.getForestGrassTiles() : [];
        const spawnAreas = this._getSpawnAreas();

        // Total tile counts for weighted area selection
        const mainTileCount = spawnAreas.reduce((sum, a) =>
            sum + (a.right - a.left) * Math.max(1, a.bottom - a.top), 0);

        // Decide whether to spawn in forest or main area based on relative size
        const totalTiles = mainTileCount + forestTiles.length;
        const spawnInForest = forestTiles.length > 0 && Math.random() < (forestTiles.length / totalTiles);

        let attempts = 0;
        const maxAttempts = CONFIG.flowers.maxSpawnAttempts;

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
            // Pick a random spawn area weighted by size, then pick a random tile
            const totalMainArea = spawnAreas.reduce((sum, a) =>
                sum + (a.right - a.left) * (a.bottom - a.top), 0);
            while (attempts < maxAttempts) {
                let r = Math.random() * totalMainArea;
                let chosenArea = spawnAreas[spawnAreas.length - 1];
                for (const area of spawnAreas) {
                    const areaSize = (area.right - area.left) * (area.bottom - area.top);
                    if (r < areaSize) { chosenArea = area; break; }
                    r -= areaSize;
                }
                const tileX = chosenArea.left + Math.floor(Math.random() * (chosenArea.right - chosenArea.left));
                const tileY = chosenArea.top  + Math.floor(Math.random() * (chosenArea.bottom - chosenArea.top));
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
        if (this.flowers.length + this.weeds.length >= this.getEffectiveMaxCount()) {
            return null;
        }

        // Get forest tiles and main tilemap spawn areas
        const forestTiles = this.forestGenerator ? this.forestGenerator.getForestGrassTiles() : [];
        const spawnAreas = this._getSpawnAreas();

        const mainTileCount = spawnAreas.reduce((sum, a) =>
            sum + (a.right - a.left) * Math.max(1, a.bottom - a.top), 0);

        const totalTiles = mainTileCount + forestTiles.length;
        const spawnInForest = forestTiles.length > 0 && Math.random() < (forestTiles.length / totalTiles);

        let attempts = 0;
        const maxAttempts = CONFIG.flowers.maxSpawnAttempts;

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
            const totalMainArea = spawnAreas.reduce((sum, a) =>
                sum + (a.right - a.left) * (a.bottom - a.top), 0);
            while (attempts < maxAttempts) {
                let r = Math.random() * totalMainArea;
                let chosenArea = spawnAreas[spawnAreas.length - 1];
                for (const area of spawnAreas) {
                    const areaSize = (area.right - area.left) * (area.bottom - area.top);
                    if (r < areaSize) { chosenArea = area; break; }
                    r -= areaSize;
                }
                const tileX = chosenArea.left + Math.floor(Math.random() * (chosenArea.right - chosenArea.left));
                const tileY = chosenArea.top  + Math.floor(Math.random() * (chosenArea.bottom - chosenArea.top));
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
        this._flowerTileMap.set(`${tileX},${tileY}`, flower);
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
        const flower = this._flowerTileMap.get(`${tileX},${tileY}`);
        return (flower && !flower.isGone && !flower.isHarvested) ? flower : null;
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
                duration: CONFIG.effects.floatingDuration,
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
            // Get spawn probability multiplier based on current flower coverage.
            // Returns 1.0 when empty, approaches 0 as coverage fills up.
            const spawnMultiplier = this.getSpawnProbabilityMultiplier();

            // Fixed interval, scaled by coverage multiplier (slows down as map fills).
            // Not scaled by tile count — density is controlled by getEffectiveMaxCount().
            if (spawnMultiplier <= 0) {
                this.spawnTimer = 0;
            } else {
                this.spawnTimer += deltaTime;

                const avgSpawnTime = this.baseSpawnInterval / spawnMultiplier;

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
        for (let i = this.flowers.length - 1; i >= 0; i--) {
            if (this.flowers[i].isGone) {
                const f = this.flowers[i];
                this._flowerTileMap.delete(`${f.tileX},${f.tileY}`);
                this.flowers.splice(i, 1);
            }
        }
        for (let i = this.weeds.length - 1; i >= 0; i--) {
            if (this.weeds[i].isGone) this.weeds.splice(i, 1);
        }

        // Update harvest effects (mark-and-sweep — avoids O(n) splice shifts)
        {
            let hasExpired = false;
            for (let i = 0; i < this.harvestEffects.length; i++) {
                const effect = this.harvestEffects[i];
                effect.timer += deltaTime;
                effect.y -= deltaTime * 0.05; // Float upward
                effect.alpha = 1 - (effect.timer / effect.duration);
                if (effect.timer >= effect.duration) hasExpired = true;
            }
            if (hasExpired) {
                let write = 0;
                for (let i = 0; i < this.harvestEffects.length; i++) {
                    if (this.harvestEffects[i].timer < this.harvestEffects[i].duration) {
                        this.harvestEffects[write++] = this.harvestEffects[i];
                    }
                }
                this.harvestEffects.length = write;
            }
        }

        // Update weed click effects (mark-and-sweep)
        {
            let hasExpired = false;
            for (let i = 0; i < this.weedClickEffects.length; i++) {
                const effect = this.weedClickEffects[i];
                effect.timer += deltaTime;
                effect.x += effect.vx * (deltaTime / 16);
                effect.y += effect.vy * (deltaTime / 16);
                effect.vy += 0.15 * (deltaTime / 16);
                effect.rotation += effect.rotationSpeed * (deltaTime / 16);
                effect.alpha = 1 - (effect.timer / effect.duration);
                effect.size *= 0.998;
                if (effect.timer >= effect.duration || effect.alpha <= 0) hasExpired = true;
            }
            if (hasExpired) {
                let write = 0;
                for (let i = 0; i < this.weedClickEffects.length; i++) {
                    const e = this.weedClickEffects[i];
                    if (e.timer < e.duration && e.alpha > 0) this.weedClickEffects[write++] = e;
                }
                this.weedClickEffects.length = write;
            }
        }
    }

    // Render all flowers and weeds (non-depth-sorted pass — not used in chunk mode)
    render(ctx, camera) {
        for (const flower of this.flowers) { if (!flower.isGone) this.renderFlower(ctx, flower); }
        for (const weed   of this.weeds)   { if (!weed.isGone)   this.renderWeed(ctx, weed); }
    }

    // Render a single flower (for depth-sorted rendering)
    renderFlower(ctx, flower) {
        if (flower.isGone) return;
        const tileSize = this.tilemap.tileSize;
        const tileData = flower.getTileData();
        const src = this.tilemap.getTilesetSourceRect(tileData.id);
        const worldX = flower.tileX * tileSize;
        const worldY = (flower.tileY + tileData.offsetY) * tileSize;
        withAlpha(ctx, flower.alpha, () =>
            ctx.drawImage(this.tilemap.tilesetImage, src.x, src.y, src.width, src.height, worldX, worldY, tileSize, tileSize)
        );
    }

    // Render a single weed (for depth-sorted rendering)
    renderWeed(ctx, weed) {
        if (weed.isGone) return;
        const tileSize = this.tilemap.tileSize;
        const tileDataArray = weed.getTileData();
        const worldX = weed.tileX * tileSize;
        withAlpha(ctx, weed.alpha, () => {
            for (const tileData of tileDataArray) {
                const src = this.tilemap.getTilesetSourceRect(tileData.id);
                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    src.x, src.y, src.width, src.height,
                    worldX, (weed.tileY + tileData.offsetY) * tileSize, tileSize, tileSize
                );
            }
        });
    }

    // renderEffects() is now a no-op: harvestEffects are batched by Game.js via renderEffectsMulti.
    renderEffects(ctx, camera) {}

    // Render physics-based weed click effects (leaf splash) — not part of the shared effect bus.
    renderWeedEffects(ctx, camera) {
        for (const effect of this.weedClickEffects) {
            withAlpha(ctx, effect.alpha, () => {
                ctx.save();
                ctx.translate(effect.x, effect.y);
                ctx.rotate(effect.rotation);
                ctx.fillStyle = effect.color;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.ellipse(0, 0, effect.size, effect.size * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -effect.size);
                ctx.lineTo(0, effect.size);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 0.5;
                ctx.stroke();
                ctx.restore();
            });
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
