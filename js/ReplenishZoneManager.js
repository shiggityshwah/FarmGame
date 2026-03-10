import { Logger } from './Logger.js';
import { tileToWorld } from './TileUtils.js';

const log = Logger.create('ReplenishZoneManager');

// Crop index → display name (mirrors CROP_DATA in Toolbar.js)
const CROP_NAMES = {
    0: 'Carrot', 1: 'Cauliflower', 2: 'Pumpkin', 3: 'Sunflower',
    4: 'Radish', 5: 'Parsnip', 6: 'Potato', 7: 'Cabbage', 8: 'Beetroot', 9: 'Wheat'
};

// Plant tool base (mirrors TOOLS.PLANT in Toolbar.js)
const PLANT_TOOL_BASE = { id: 'plant', tileId: 2857, name: 'Plant', animation: 'DOING', hasSubmenu: true };

export class ReplenishZoneManager {
    constructor(game, jobManager, inventory) {
        this.game = game;
        this.jobManager = jobManager;
        this.inventory = inventory;

        // Map of zone id → zone object
        this.zones = new Map();
        // Reverse lookup: "x,y" → zone id (for O(1) tile → zone lookup)
        this._tileToZone = new Map();
        this._nextId = 0;
    }

    // Create a new zone for a set of tile positions and a crop type index.
    // Returns the new zone's id.
    // Tiles already belonging to another zone are transferred (eviction).
    createZone(tiles, cropTypeIndex) {
        const id = `zone_${this._nextId++}`;
        const tileSet = new Set();

        for (const tile of tiles) {
            const key = `${tile.x},${tile.y}`;
            // Evict tile from any existing zone
            const existingZoneId = this._tileToZone.get(key);
            if (existingZoneId !== undefined) {
                const existingZone = this.zones.get(existingZoneId);
                if (existingZone) {
                    existingZone.tiles.delete(key);
                    if (existingZone.tiles.size === 0) {
                        this.zones.delete(existingZoneId);
                        log.debug(`Zone ${existingZoneId} deleted (no tiles remaining after eviction)`);
                    }
                }
            }
            tileSet.add(key);
            this._tileToZone.set(key, id);
        }

        const cropName = CROP_NAMES[cropTypeIndex] || `Crop ${cropTypeIndex}`;
        const active = this._hasSeedForCrop(cropTypeIndex);
        this.zones.set(id, { id, tiles: tileSet, cropTypeIndex, cropName, active });
        log.info(`Zone ${id} created: ${tileSet.size} tiles, crop=${cropName}, active=${active}`);
        return id;
    }

    // Delete a zone entirely.
    deleteZone(id) {
        const zone = this.zones.get(id);
        if (!zone) return;
        for (const key of zone.tiles) {
            this._tileToZone.delete(key);
        }
        this.zones.delete(id);
        log.info(`Zone ${id} deleted`);
    }

    // Change the seed type of a zone. Re-checks active state.
    changeSeed(id, newCropTypeIndex) {
        const zone = this.zones.get(id);
        if (!zone) return;
        zone.cropTypeIndex = newCropTypeIndex;
        zone.cropName = CROP_NAMES[newCropTypeIndex] || `Crop ${newCropTypeIndex}`;
        zone.active = this._hasSeedForCrop(newCropTypeIndex);
        log.info(`Zone ${id} seed changed to ${zone.cropName}, active=${zone.active}`);
    }

    // Add new tiles to an existing zone (zone expansion).
    // New tiles are evicted from any other zones they belonged to.
    expandZone(id, newTiles) {
        const zone = this.zones.get(id);
        if (!zone) return;
        for (const tile of newTiles) {
            const key = `${tile.x},${tile.y}`;
            const existingZoneId = this._tileToZone.get(key);
            if (existingZoneId !== undefined && existingZoneId !== id) {
                const existingZone = this.zones.get(existingZoneId);
                if (existingZone) {
                    existingZone.tiles.delete(key);
                    if (existingZone.tiles.size === 0) {
                        this.zones.delete(existingZoneId);
                    }
                }
            }
            zone.tiles.add(key);
            this._tileToZone.set(key, id);
        }
        log.info(`Zone ${id} expanded by ${newTiles.length} tiles, total=${zone.tiles.size}`);
    }

    // Find which zone a tile belongs to. Returns the zone or null.
    getZoneForTile(x, y) {
        const id = this._tileToZone.get(`${x},${y}`);
        return id !== undefined ? (this.zones.get(id) || null) : null;
    }

    // Called after a crop is harvested at (tileX, tileY).
    // If the tile belongs to a zone, queues a new plant job or pauses the zone.
    onHarvest(tileX, tileY) {
        const zone = this.getZoneForTile(tileX, tileY);
        if (!zone) return;

        if (this._hasSeedForCrop(zone.cropTypeIndex)) {
            zone.active = true;
            this._queueReplant(zone.cropTypeIndex, tileX, tileY);
        } else {
            if (zone.active) {
                zone.active = false;
                log.info(`Zone ${zone.id} paused — no seeds for ${zone.cropName}`);
            }
        }
    }

    // Called on inventory change. Reactivates paused zones that now have seeds,
    // and queues replant jobs for any zone tiles that are hoed but currently empty
    // (e.g. harvested while the zone was paused, or missed due to seed exhaustion mid-job).
    checkPausedZones() {
        for (const zone of this.zones.values()) {
            if (!zone.active && this._hasSeedForCrop(zone.cropTypeIndex)) {
                zone.active = true;
                log.info(`Zone ${zone.id} reactivated for ${zone.cropName}`);
                this._replantEmptyZoneTiles(zone);
            }
        }
    }

    // Pause all active zones for a specific crop type.
    // Called when seeds are exhausted mid-job so the zone transitions to paused,
    // which lets checkPausedZones re-queue the missed tiles when seeds arrive.
    pauseZonesForCrop(cropTypeIndex) {
        for (const zone of this.zones.values()) {
            if (zone.active && zone.cropTypeIndex === cropTypeIndex) {
                zone.active = false;
                log.info(`Zone ${zone.id} paused — seeds exhausted for ${zone.cropName}`);
            }
        }
    }

    // Render zone borders on the canvas.
    // Active zones: green border; paused zones: grey border.
    // NOTE: The canvas context already has the camera transform applied (world coordinates),
    // so we draw at world-pixel coords directly — no worldToScreen conversion needed.
    render(ctx, camera, tileSize) {
        if (this.zones.size === 0) return;

        const zoom = camera.zoom;
        ctx.save();
        for (const zone of this.zones.values()) {
            ctx.strokeStyle = zone.active ? 'rgba(80,200,100,0.75)' : 'rgba(160,160,160,0.65)';
            ctx.lineWidth = 2 / zoom;  // keep ~2px on screen regardless of zoom
            ctx.beginPath();

            for (const key of zone.tiles) {
                const [tx, ty] = key.split(',').map(Number);
                // World-pixel origin of this tile
                const wx = tileToWorld(tx, tileSize);
                const wy = tileToWorld(ty, tileSize);

                // Draw only edges that border outside the zone
                const neighbors = [
                    { key: `${tx},${ty - 1}`, x1: 0,        y1: 0,        x2: tileSize, y2: 0        }, // top
                    { key: `${tx},${ty + 1}`, x1: 0,        y1: tileSize, x2: tileSize, y2: tileSize }, // bottom
                    { key: `${tx - 1},${ty}`, x1: 0,        y1: 0,        x2: 0,        y2: tileSize }, // left
                    { key: `${tx + 1},${ty}`, x1: tileSize, y1: 0,        x2: tileSize, y2: tileSize }  // right
                ];

                for (const n of neighbors) {
                    if (!zone.tiles.has(n.key)) {
                        ctx.moveTo(wx + n.x1, wy + n.y1);
                        ctx.lineTo(wx + n.x2, wy + n.y2);
                    }
                }
            }

            ctx.stroke();
        }
        ctx.restore();
    }

    // --- Private helpers ---

    _hasSeedForCrop(cropTypeIndex) {
        const seedResource = this.inventory.getSeedByCropIndex(cropTypeIndex);
        return seedResource ? this.inventory.has(seedResource, 1) : false;
    }

    _queueReplant(cropTypeIndex, tileX, tileY) {
        const cropName = CROP_NAMES[cropTypeIndex] || `Crop ${cropTypeIndex}`;
        const plantTool = { ...PLANT_TOOL_BASE, seedType: cropTypeIndex, seedName: cropName };
        this.jobManager.addJobToQueue(plantTool, [{ x: tileX, y: tileY }], 'all');
        log.debug(`Replant queued at (${tileX},${tileY}) for ${cropName}`);
    }

    // Queue replant jobs for all zone tiles that are hoed but have no live crop.
    // Used when reactivating a paused zone so empty tiles don't stay barren.
    _replantEmptyZoneTiles(zone) {
        const overlayManager = this.game.overlayManager;
        const cropManager = this.game.cropManager;
        let queued = 0;
        for (const key of zone.tiles) {
            // Re-check seeds each iteration — may exhaust partway through
            if (!this._hasSeedForCrop(zone.cropTypeIndex)) {
                zone.active = false;
                log.info(`Zone ${zone.id} re-paused — seeds exhausted while queuing missed tiles`);
                break;
            }
            // Must be a hoed tile
            if (!(overlayManager?.hoedTiles?.has(key) ?? false)) continue;
            const [tx, ty] = key.split(',').map(Number);
            // Skip if a live crop is already planted on this tile.
            // Use getCropBaseAt (not getCropAt) so the upper sprite tile of a tall
            // crop planted on a neighbouring row doesn't falsely block this slot.
            if (cropManager?.getCropBaseAt(tx, ty)) continue;
            this._queueReplant(zone.cropTypeIndex, tx, ty);
            queued++;
        }
        if (queued > 0) log.info(`Zone ${zone.id}: queued replant for ${queued} empty tile(s)`);
    }
}
