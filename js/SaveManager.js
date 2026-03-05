/**
 * SaveManager - Handles game save/load functionality
 *
 * Save data is stored in localStorage under 'farmgame_save' as JSON.
 * Supports: auto-save (beforeunload + 60s interval), download as .json,
 * copy to clipboard, paste JSON to load, and new game (clear + reload).
 */

import { Logger } from './Logger.js';
import { ForestTree } from './ForestGenerator.js';
import { Crop, getCropTypeByIndex } from './Crop.js';
import { Tree, TREE_TYPES } from './Tree.js';
import { OreVein, ORE_TYPES } from './OreVein.js';

const log = Logger.create('SaveManager');

const SAVE_VERSION = 1;
const SAVE_KEY = 'farmgame_save';

// Mirrors CROP_NAMES from ReplenishZoneManager.js
const CROP_NAMES = {
    0: 'Carrot', 1: 'Cauliflower', 2: 'Pumpkin', 3: 'Sunflower',
    4: 'Radish', 5: 'Parsnip', 6: 'Potato', 7: 'Cabbage', 8: 'Beetroot', 9: 'Wheat'
};

export class SaveManager {
    constructor(game) {
        this.game = game;
        this._autoSaveInterval = null;
        this._beforeUnloadHandler = null;
    }

    // ─── Auto-save ────────────────────────────────────────────────────────────

    startAutoSave() {
        this._autoSaveInterval = setInterval(() => this.saveToStorage(), 60_000);
        this._beforeUnloadHandler = () => this.saveToStorage();
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
        log.info('Auto-save started (60s interval + beforeunload)');
    }

    stopAutoSave() {
        if (this._autoSaveInterval) {
            clearInterval(this._autoSaveInterval);
            this._autoSaveInterval = null;
        }
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    saveToStorage() {
        try {
            const data = this.serialize();
            localStorage.setItem(SAVE_KEY, data);
            log.info(`Game saved (${(data.length / 1024).toFixed(1)} KB)`);
            return true;
        } catch (e) {
            log.error('Failed to save game:', e);
            return false;
        }
    }

    hasSave() {
        return localStorage.getItem(SAVE_KEY) !== null;
    }

    async tryLoadFromStorage() {
        const json = localStorage.getItem(SAVE_KEY);
        if (!json) return false;
        try {
            await this.loadFromJson(json);
            log.info('Save loaded from localStorage');
            return true;
        } catch (e) {
            log.warn('Failed to load save, starting fresh:', e.message);
            return false;
        }
    }

    newGame() {
        this.stopAutoSave(); // prevent beforeunload from re-saving before reload
        localStorage.removeItem(SAVE_KEY);
        location.reload();
    }

    // ─── Serialization ────────────────────────────────────────────────────────

    serialize() {
        return JSON.stringify(this.buildSaveData());
    }

    buildSaveData() {
        const g = this.game;
        return {
            version: SAVE_VERSION,
            timestamp: Date.now(),
            inventory: this._serializeInventory(),
            chunks: this._serializeChunks(),
            chunkTiles: this._serializeChunkTiles(),
            hoedTiles: this._serializeHoedTiles(),
            holeOverlays: this._serializeHoleOverlays(),
            crops: this._serializeCrops(),
            trees: this._serializeTrees(),
            forestTrees: this._serializeForestTrees(),
            oreVeins: this._serializeOreVeins(),
            forestPocketOres: this._serializeForestPocketOres(),
            forestPocketCrops: this._serializeForestPocketCrops(),
            zones: this._serializeZones(),
            homeUpgrades: this._serializeHomeUpgrades(),
            toolAnimationMultipliers: { ...g.toolAnimationMultipliers },
            player: {
                humanX: g.humanPosition.x,
                humanY: g.humanPosition.y,
                goblinHired: g.goblinHired,
                wateringCanWater: g.wateringCanWater,
                goblinWaterCanWater: g.goblinWaterCanWater,
                hairStyle: g.currentHairStyle
            },
            camera: {
                x: g.camera.x,
                y: g.camera.y,
                zoom: g.camera.zoom
            }
        };
    }

    _serializeInventory() {
        // items is a plain object { [resourceId]: count }
        return { ...this.game.inventory.items };
    }

    _serializeChunks() {
        const chunks = [];
        for (const chunk of this.game.chunkManager.chunks.values()) {
            chunks.push({ col: chunk.col, row: chunk.row, type: chunk.type, state: chunk.state });
        }
        return chunks;
    }

    _serializeChunkTiles() {
        const result = [];
        for (const [key, uint16Array] of this.game.tilemap.chunkTiles) {
            result.push({ key, tiles: Array.from(uint16Array) });
        }
        return result;
    }

    _serializeHoedTiles() {
        return Array.from(this.game.overlayManager.hoedTiles);
    }

    _serializeHoleOverlays() {
        const holes = [];
        for (const [, overlayList] of this.game.overlayManager.overlays) {
            for (const overlay of overlayList) {
                if (overlay.tileId === 1138) { // HOLE_OVERLAY_ID
                    holes.push({ x: overlay.tileX, y: overlay.tileY });
                }
            }
        }
        return holes;
    }

    _serializeCrops() {
        return this.game.cropManager.crops
            .filter(c => !c.isGone && !c.isHarvested)
            .map(c => ({
                tileX: c.tileX,
                tileY: c.tileY,
                cropTypeIndex: c.cropType.index,
                stage: c.stage,
                wateringState: c.wateringState,
                wateringsThisStage: c.wateringsThisStage,
                wateringCooldownTimer: c.wateringCooldownTimer,
                startAsPlanted: c.startAsPlanted !== undefined ? c.startAsPlanted : true,
                growthTimer: c.growthTimer
            }));
    }

    _serializeTrees() {
        if (!this.game.treeManager) return [];
        return this.game.treeManager.trees
            .filter(t => !t.isGone)
            .map(t => ({
                tileX: t.tileX,
                tileY: t.tileY,
                treeType: t.treeType.name === 'Thin Tree' ? 'THIN' : 'THICK',
                resourcesRemaining: t.resourcesRemaining,
                initialResources: t.initialResources
            }));
    }

    _serializeForestTrees() {
        if (!this.game.forestGenerator) return [];
        return this.game.forestGenerator.trees
            .filter(t => !t.isGone)
            .map(t => ({
                baseX: t.baseX,
                baseY: t.baseY,
                isLit: t.isLit,
                resourcesRemaining: t.resourcesRemaining,
                initialResources: t.initialResources
            }));
    }

    _serializeOreVeins() {
        if (!this.game.oreManager) return [];
        return this.game.oreManager.oreVeins
            .filter(o => !o.isGone)
            .map(o => ({
                tileX: o.tileX,
                tileY: o.tileY,
                oreType: o.oreType.name,
                resourcesRemaining: o.resourcesRemaining,
                initialResources: o.initialResources
            }));
    }

    _serializeForestPocketOres() {
        const fg = this.game.forestGenerator;
        if (!fg) return [];
        return fg.pocketOreVeins
            .filter(o => !o.isGone)
            .map(o => ({
                tileX: o.tileX,
                tileY: o.tileY,
                oreType: o.oreType.name,
                resourcesRemaining: o.resourcesRemaining,
                initialResources: o.initialResources
            }));
    }

    _serializeForestPocketCrops() {
        const fg = this.game.forestGenerator;
        if (!fg) return [];
        return fg.pocketCrops
            .filter(c => !c.isGone && !c.isHarvested)
            .map(c => ({
                tileX: c.tileX,
                tileY: c.tileY,
                cropTypeIndex: c.cropType.index,
                stage: c.stage,
                wateringState: c.wateringState,
                wateringsThisStage: c.wateringsThisStage,
                wateringCooldownTimer: c.wateringCooldownTimer,
                startAsPlanted: c.startAsPlanted,
                growthTimer: c.growthTimer
            }));
    }

    _serializeZones() {
        const rzm = this.game.replenishZoneManager;
        if (!rzm) return { nextId: 0, entries: [] };
        const entries = [];
        for (const zone of rzm.zones.values()) {
            entries.push({
                id: zone.id,
                tiles: Array.from(zone.tiles),
                cropTypeIndex: zone.cropTypeIndex,
                active: zone.active
            });
        }
        return { nextId: rzm._nextId, entries };
    }

    _serializeHomeUpgrades() {
        const hu = this.game.homeUpgrades;
        return {
            slots: hu.slots.slice(),
            shrineUpgrades: { ...hu.shrineUpgrades },
            purchasedToolUpgrades: Array.from(hu.purchasedToolUpgrades)
        };
    }

    // ─── Deserialization ──────────────────────────────────────────────────────

    async loadFromJson(jsonString) {
        const data = JSON.parse(jsonString);
        if (data.version !== SAVE_VERSION) {
            throw new Error(`Save version mismatch: expected ${SAVE_VERSION}, got ${data.version}`);
        }
        await this.applyLoad(data);
    }

    async applyLoad(data) {
        log.info('Applying save data...');

        // 1. Inventory
        this._restoreInventory(data.inventory);

        // 2. Chunks — restore ownership states
        this._restoreChunks(data.chunks);

        // 3. ChunkTiles — restore tile data (includes hoed tiles, path tiles)
        this._restoreChunkTiles(data.chunkTiles);

        // 4. Overlay Manager — clear, restore hoedTiles, regenerate edges, add holes
        this._restoreOverlays(data.hoedTiles, data.holeOverlays);

        // 5. Crops
        this._restoreCrops(data.crops);

        // 6. Trees (TreeManager — farm/owned-area trees)
        this._restoreTrees(data.trees);

        // 7. Forest Trees (ForestGenerator — forest chunk trees) + rebuild trunkTileMap
        this._restoreForestTrees(data.forestTrees);

        // 8. Ore Veins (farm/owned chunks only — forest pocket ores handled separately)
        this._restoreOreVeins(data.oreVeins);

        // 9. Forest pocket ores and crops (live only in forestGenerator, not in oreManager/cropManager)
        // Only restore if the save contains these fields — old saves lack them, and in that case
        // we keep the procedurally generated pocket entities from game.init() unchanged.
        if (data.forestPocketOres !== undefined) {
            this._restoreForestPocketOres(data.forestPocketOres);
            this._restoreForestPocketCrops(data.forestPocketCrops || []);
        }

        // 10. Replenish Zones
        this._restoreZones(data.zones);

        // 11. Home Upgrades + Tool Animation Multipliers
        this._restoreHomeUpgrades(data.homeUpgrades, data.toolAnimationMultipliers);

        // 12. Player state (async: reloads hair sprites)
        await this._restorePlayer(data.player);

        // 13. Camera
        this._restoreCamera(data.camera);

        // 14. UI refresh (fires onChange listeners, gold display, water display)
        this._refreshUI();

        log.info('Save data applied successfully');
    }

    _restoreInventory(savedInv) {
        const items = this.game.inventory.items;
        // Zero out everything
        for (const key of Object.keys(items)) {
            items[key] = 0;
        }
        // Apply saved values
        for (const [id, count] of Object.entries(savedInv)) {
            if (id in items) items[id] = count;
        }
        // notifyChange is deferred to _refreshUI at the end
    }

    _restoreChunks(savedChunks) {
        const cm = this.game.chunkManager;
        for (const sc of savedChunks) {
            const key = `${sc.col},${sc.row}`;
            const existing = cm.chunks.get(key);
            if (existing) {
                existing.state = sc.state;
                existing.type = sc.type;
                existing.generated = true;
            } else {
                // Chunk was created after initial 3×5 grid (e.g. purchased expansion)
                cm.chunks.set(key, {
                    col: sc.col, row: sc.row,
                    type: sc.type, state: sc.state,
                    generated: true
                });
            }
        }
        cm._updateMapBounds();
        cm._updatePurchasableChunks();
    }

    _restoreChunkTiles(savedTiles) {
        const tilemap = this.game.tilemap;
        for (const entry of savedTiles) {
            tilemap.chunkTiles.set(entry.key, new Uint16Array(entry.tiles));
        }
        this.game.chunkManager._updateMapBounds();
    }

    _restoreOverlays(hoedTiles, holeOverlays) {
        const om = this.game.overlayManager;
        om.clearAllOverlays();
        om.hoedTiles.clear();

        // Restore hoed tile tracking
        for (const key of hoedTiles) {
            om.hoedTiles.add(key);
        }

        // Regenerate hoed ground edge overlays from restored hoedTiles
        om.updateAllEdgeOverlays();

        // Regenerate path edge overlays (uses game.pathPositions)
        this.game.initPathEdgeOverlays();

        // Restore hole overlays (tileId 1138)
        for (const hole of holeOverlays) {
            om.addOverlay(hole.x, hole.y, 1138);
        }
    }

    _restoreCrops(savedCrops) {
        const cm = this.game.cropManager;
        cm.resources = [];
        cm.crops = cm.resources;
        cm.effects = [];
        for (const sc of savedCrops) {
            const cropType = getCropTypeByIndex(sc.cropTypeIndex);
            const crop = new Crop(sc.tileX, sc.tileY, cropType, sc.startAsPlanted);
            // Override constructor defaults with saved state
            crop.stage = sc.stage;
            crop.wateringState = sc.wateringState;
            crop.wateringsThisStage = sc.wateringsThisStage;
            crop.wateringCooldownTimer = sc.wateringCooldownTimer;
            crop.growthTimer = sc.growthTimer;
            cm.crops.push(crop);
        }
    }

    _restoreTrees(savedTrees) {
        const tm = this.game.treeManager;
        if (!tm) return;
        tm.resources = [];
        tm.trees = tm.resources;
        tm.effects = [];
        for (const st of savedTrees) {
            const treeType = TREE_TYPES[st.treeType];
            if (!treeType) continue;
            const tree = new Tree(st.tileX, st.tileY, treeType);
            tree.resourcesRemaining = st.resourcesRemaining;
            tree.initialResources = st.initialResources;
            tm.trees.push(tree);
        }
    }

    _restoreForestTrees(savedForestTrees) {
        const fg = this.game.forestGenerator;
        if (!fg) return;

        // Clear tree state only — pocket state is handled separately by _restoreForestPocketOres/Crops
        fg.trees = [];
        fg.treeMap.clear();
        fg.trunkTileMap.clear();

        // Reconstruct ForestTree objects from save data
        for (const ft of savedForestTrees) {
            const tree = new ForestTree(ft.baseX, ft.baseY, ft.isLit);
            // Override randomly-initialized resources with saved values
            tree.resourcesRemaining = ft.resourcesRemaining;
            tree.initialResources = ft.initialResources;

            fg.trees.push(tree);
            fg.treeMap.set(`${ft.baseX},${ft.baseY}`, tree);
            // Each forest tree occupies two trunk positions (left and right)
            fg.trunkTileMap.set(`${ft.baseX},${ft.baseY}`, tree);
            fg.trunkTileMap.set(`${ft.baseX + 1},${ft.baseY}`, tree);
        }

        // Rebuild neighbor flags for correct rendering (shadows, crowns, adjacency)
        fg.updateNeighborFlags();
    }

    _restoreOreVeins(savedOres) {
        const om = this.game.oreManager;
        if (!om) return;
        om.resources = [];
        om.oreVeins = om.resources;
        om.effects = [];
        for (const so of savedOres) {
            // oreType.name is 'Iron', 'Coal', etc. — look up by uppercased key
            const oreType = ORE_TYPES[so.oreType.toUpperCase()];
            if (!oreType) continue;
            const ore = new OreVein(so.tileX, so.tileY, oreType);
            ore.resourcesRemaining = so.resourcesRemaining;
            ore.initialResources = so.initialResources;
            om.oreVeins.push(ore);
        }
    }

    _restoreForestPocketOres(savedPocketOres) {
        const fg = this.game.forestGenerator;
        if (!fg) return;
        // Clear all pocket state before restoring from save
        fg.pocketOreVeins = [];
        fg.pocketCrops = [];
        fg.pocketOccupiedTiles.clear();
        for (const so of savedPocketOres) {
            const oreType = ORE_TYPES[so.oreType.toUpperCase()];
            if (!oreType) continue;
            const ore = new OreVein(so.tileX, so.tileY, oreType);
            ore.resourcesRemaining = so.resourcesRemaining;
            ore.initialResources = so.initialResources;
            fg.pocketOreVeins.push(ore);
            // Rebuild occupied tile buffer (4×4 area around 2×2 ore, matching spawnPocketOre)
            for (let ox = -1; ox <= 2; ox++) {
                for (let oy = -1; oy <= 2; oy++) {
                    fg.pocketOccupiedTiles.add(`${so.tileX + ox},${so.tileY + oy}`);
                }
            }
        }
    }

    _restoreForestPocketCrops(savedPocketCrops) {
        const fg = this.game.forestGenerator;
        if (!fg) return;
        fg.pocketCrops = [];
        for (const sc of savedPocketCrops) {
            const cropType = getCropTypeByIndex(sc.cropTypeIndex);
            const crop = new Crop(sc.tileX, sc.tileY, cropType, sc.startAsPlanted);
            crop.stage = sc.stage;
            crop.wateringState = sc.wateringState;
            crop.wateringsThisStage = sc.wateringsThisStage;
            crop.wateringCooldownTimer = sc.wateringCooldownTimer;
            crop.growthTimer = sc.growthTimer;
            fg.pocketCrops.push(crop);
            fg.pocketOccupiedTiles.add(`${sc.tileX},${sc.tileY}`);
        }
    }

    _restoreZones(savedZones) {
        const rzm = this.game.replenishZoneManager;
        if (!rzm) return;
        rzm.zones.clear();
        rzm._tileToZone.clear();
        rzm._nextId = savedZones.nextId;
        for (const sz of savedZones.entries) {
            const tileSet = new Set(sz.tiles);
            rzm.zones.set(sz.id, {
                id: sz.id,
                tiles: tileSet,
                cropTypeIndex: sz.cropTypeIndex,
                cropName: CROP_NAMES[sz.cropTypeIndex] || `Crop ${sz.cropTypeIndex}`,
                active: sz.active
            });
            for (const key of tileSet) {
                rzm._tileToZone.set(key, sz.id);
            }
        }
    }

    _restoreHomeUpgrades(savedHU, savedMultipliers) {
        const g = this.game;
        g.homeUpgrades.slots = savedHU.slots.slice();
        Object.assign(g.homeUpgrades.shrineUpgrades, savedHU.shrineUpgrades);
        g.homeUpgrades.purchasedToolUpgrades = new Set(savedHU.purchasedToolUpgrades);
        if (savedMultipliers) {
            Object.assign(g.toolAnimationMultipliers, savedMultipliers);
        }
    }

    async _restorePlayer(savedPlayer) {
        const g = this.game;
        g.humanPosition.x = savedPlayer.humanX;
        g.humanPosition.y = savedPlayer.humanY;
        g.wateringCanWater = savedPlayer.wateringCanWater;
        g.goblinWaterCanWater = savedPlayer.goblinWaterCanWater;
        g.currentHairStyle = savedPlayer.hairStyle;
        if (savedPlayer.goblinHired && !g.goblinHired) {
            g.hireGoblin();
        }
        // Reload sprites with restored hair style
        await g.loadHumanSprites();
    }

    _restoreCamera(savedCamera) {
        const cam = this.game.camera;
        cam.x = savedCamera.x;
        cam.y = savedCamera.y;
        cam.zoom = savedCamera.zoom;
    }

    _refreshUI() {
        const g = this.game;
        // Skip count-up animation — jump straight to saved gold value
        g.targetGold = g.inventory.getGold();
        g.displayedGold = g.targetGold;
        // Fire inventory onChange to refresh all subscribers (toolbar seed counts, shop, etc.)
        g.inventory.notifyChange();
        // Refresh watering can display
        if (g.toolbar?.refreshWaterDisplay) g.toolbar.refreshWaterDisplay();
    }

    // ─── Download / Clipboard ─────────────────────────────────────────────────

    downloadSave() {
        const json = this.serialize();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `farmgame_save_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log.info('Save file downloaded');
    }

    async copyToClipboard() {
        const json = this.serialize();
        try {
            await navigator.clipboard.writeText(json);
        } catch (_) {
            // Fallback for file:// URLs where Clipboard API may be blocked
            const ta = document.createElement('textarea');
            ta.value = json;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        log.info('Save copied to clipboard');
    }
}
