/**
 * BuildingManager — Manages all player-placed buildings.
 *
 * Responsibilities:
 *   - Loading and caching CSV layer data for each building definition
 *   - Placing, completing, and deconstructing buildings
 *   - Rendering buildings by render pass ('ground', 'upper', 'roof')
 *   - Ghost preview rendering for placement mode
 *   - Obstacle checking for pathfinding
 *   - Building state management (under_construction / inactive / active_empty / active_occupied)
 */

import { Logger } from './Logger.js';
import { BUILDING_DEFS } from './BuildingRegistry.js';

const log = Logger.create('BuildingManager');

export class BuildingManager {
    constructor(tilemap) {
        this.tilemap = tilemap;

        /** All currently placed buildings (under construction and complete). */
        this.placedBuildings = [];

        /**
         * Cache of parsed layer data per definition ID.
         * Map<defId, Array<{ renderPass, tiles: number[][] }>>
         */
        this._layerCache = new Map();

        this._nextId = 0;

        /**
         * Callback fired when a building transitions to a non-under_construction state.
         * Signature: (building) => void
         */
        this.onBuildingCompleted = null;

    }

    // ─── CSV Loading ─────────────────────────────────────────────────────────────

    /**
     * Load and cache all layer data for a definition.
     * Returns a promise; call this before rendering or placing a building.
     * Safe to call multiple times — returns cached result on subsequent calls.
     */
    async loadDefinitionLayers(defId) {
        if (this._layerCache.has(defId)) return this._layerCache.get(defId);

        const def = BUILDING_DEFS[defId];
        if (!def || !def.hasTilemap || !def.tilemapPrefix) {
            this._layerCache.set(defId, []);
            return [];
        }

        const layerData = [];
        for (const layer of def.layers) {
            const url = def.tilemapPrefix + layer.csvSuffix;
            try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const text = await resp.text();
                const tiles = text.trim().split('\n').map(row =>
                    row.split(',').map(v => parseInt(v.trim(), 10))
                );
                layerData.push({ renderPass: layer.renderPass, tiles });
            } catch (err) {
                log.warn(`Failed to load layer ${url}: ${err.message}`);
                layerData.push({ renderPass: layer.renderPass, tiles: [] });
            }
        }

        this._layerCache.set(defId, layerData);
        log.debug(`Loaded ${layerData.length} layers for ${defId}`);
        return layerData;
    }

    // ─── Placement ───────────────────────────────────────────────────────────────

    /**
     * Place a building on the world.
     * Returns the building instance after loading its layer data.
     */
    async placeBuilding(defId, tileX, tileY, state = 'under_construction') {
        await this.loadDefinitionLayers(defId);

        const building = {
            id: `b_${this._nextId++}`,
            definitionId: defId,
            tileX,
            tileY,
            state,           // 'under_construction' | 'inactive' | 'active_empty' | 'active_occupied'
            occupant: null,  // villager type string when occupied
            pathConnected: false,
        };

        this.placedBuildings.push(building);
        log.info(`Placed building ${building.id} (${defId}) at (${tileX},${tileY}) state=${state}`);
        return building;
    }

    // ─── State Transitions ───────────────────────────────────────────────────────

    /**
     * Mark a building as construction-complete (inactive until path-connected).
     * Fires onBuildingCompleted callback.
     */
    completeBuildingById(id) {
        const building = this.getBuildingById(id);
        if (!building) return;
        building.state = 'inactive';
        log.info(`Building ${id} construction complete → inactive`);
        this.onBuildingCompleted?.(building);
    }

    /**
     * Remove a building and return its definition ID and position for refund/cleanup.
     */
    deconstructBuilding(id) {
        const idx = this.placedBuildings.findIndex(b => b.id === id);
        if (idx === -1) return null;
        const [building] = this.placedBuildings.splice(idx, 1);
        log.info(`Deconstructed building ${id}`);
        return building;
    }

    // ─── Lookups ─────────────────────────────────────────────────────────────────

    getBuildingById(id) {
        return this.placedBuildings.find(b => b.id === id) ?? null;
    }

    /**
     * Return the building whose footprint contains the given tile, or null.
     * Under-construction buildings are included (they have footprints for display).
     */
    getBuildingAt(tileX, tileY) {
        for (const b of this.placedBuildings) {
            const def = BUILDING_DEFS[b.definitionId];
            if (!def) continue;
            if (tileX >= b.tileX && tileX < b.tileX + def.footprint.width &&
                tileY >= b.tileY && tileY < b.tileY + def.footprint.height) {
                return b;
            }
        }
        return null;
    }

    /** Returns all world tile positions occupied by the building's footprint. */
    getFootprintTiles(building) {
        const def = BUILDING_DEFS[building.definitionId];
        if (!def) return [];
        const tiles = [];
        for (let dx = 0; dx < def.footprint.width; dx++) {
            for (let dy = 0; dy < def.footprint.height; dy++) {
                tiles.push({ x: building.tileX + dx, y: building.tileY + dy });
            }
        }
        return tiles;
    }

    /**
     * Returns true if a completed (non-under_construction) building occupies this tile.
     * Used by the pathfinder — under-construction buildings are passable.
     */
    isObstacle(tileX, tileY) {
        for (const b of this.placedBuildings) {
            if (b.state === 'under_construction') continue;
            const def = BUILDING_DEFS[b.definitionId];
            if (!def) continue;
            if (tileX >= b.tileX && tileX < b.tileX + def.footprint.width &&
                tileY >= b.tileY && tileY < b.tileY + def.footprint.height) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if the player is standing inside any completed building
     * (used for roof-hiding logic).
     */
    isPlayerInsideBuilding(playerTileX, playerTileY) {
        for (const b of this.placedBuildings) {
            if (b.state === 'under_construction') continue;
            const def = BUILDING_DEFS[b.definitionId];
            if (!def || def.layers.every(l => l.renderPass !== 'roof')) continue;
            if (playerTileX >= b.tileX && playerTileX < b.tileX + def.footprint.width &&
                playerTileY >= b.tileY && playerTileY < b.tileY + def.footprint.height) {
                return b;
            }
        }
        return null;
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    /**
     * Render all placed buildings for a specific render pass.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     * @param {'ground'|'upper'|'roof'} pass
     * @param {{tileX, tileY}} playerTile  Current player tile (for roof-hiding)
     */
    render(ctx, camera, pass, playerTile = null) {
        if (!this.tilemap.tilesetImage) return;

        for (const building of this.placedBuildings) {
            const def = BUILDING_DEFS[building.definitionId];
            if (!def || !def.hasTilemap) continue;

            // Hide roof when player is inside this building
            if (pass === 'roof' && playerTile) {
                if (playerTile.x >= building.tileX && playerTile.x < building.tileX + def.footprint.width &&
                    playerTile.y >= building.tileY && playerTile.y < building.tileY + def.footprint.height) {
                    continue;
                }
            }

            const alpha = building.state === 'under_construction' ? 0.3 : 1.0;
            this._renderBuilding(ctx, camera, building, def, pass, alpha);
        }
    }

    /**
     * Render a ghost preview for placement mode.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     * @param {string} defId   Building definition to preview
     * @param {number} tileX   Top-left tile X of placement
     * @param {number} tileY   Top-left tile Y of placement
     * @param {boolean} valid  true = green tint, false = red tint
     */
    renderGhost(ctx, camera, defId, tileX, tileY, valid) {
        if (!this.tilemap.tilesetImage) return;
        const def = BUILDING_DEFS[defId];
        if (!def || !def.hasTilemap) return;

        const ghostBuilding = { id: '_ghost', definitionId: defId, tileX, tileY, state: 'inactive', occupant: null };

        ctx.save();
        ctx.globalAlpha = 0.5;

        // Draw ground layers first
        this._renderBuilding(ctx, camera, ghostBuilding, def, 'ground', 1.0);
        this._renderBuilding(ctx, camera, ghostBuilding, def, 'roof', 1.0);

        // Validity tint overlay
        const tileSize = this.tilemap.tileSize;
        const worldX = tileX * tileSize;
        const worldY = tileY * tileSize;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = valid ? 'rgba(0, 255, 80, 1)' : 'rgba(255, 50, 50, 1)';
        ctx.fillRect(worldX, worldY, def.footprint.width * tileSize, def.footprint.height * tileSize);

        ctx.restore();
    }

    /**
     * Debug overlay: draw building states as colored rectangles.
     */
    renderDebugOverlay(ctx, camera) {
        const tileSize = this.tilemap.tileSize;
        const stateColors = {
            'under_construction': 'rgba(255, 220, 0, 0.4)',
            'inactive':           'rgba(255, 60, 60, 0.4)',
            'active_empty':       'rgba(60, 255, 100, 0.4)',
            'active_occupied':    'rgba(80, 140, 255, 0.4)',
        };
        const labelColors = {
            'under_construction': '#ffdd00',
            'inactive':           '#ff4444',
            'active_empty':       '#44ff66',
            'active_occupied':    '#5599ff',
        };

        ctx.save();
        for (const b of this.placedBuildings) {
            const def = BUILDING_DEFS[b.definitionId];
            if (!def) continue;
            const wx = b.tileX * tileSize;
            const wy = b.tileY * tileSize;
            const w = def.footprint.width * tileSize;
            const h = def.footprint.height * tileSize;
            ctx.fillStyle = stateColors[b.state] ?? 'rgba(200,200,200,0.4)';
            ctx.fillRect(wx, wy, w, h);
            ctx.strokeStyle = labelColors[b.state] ?? '#aaa';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.setLineDash([]);
            ctx.strokeRect(wx, wy, w, h);

            const zoom = camera.zoom;
            ctx.font = `bold ${Math.round(10 / zoom)}px sans-serif`;
            ctx.fillStyle = labelColors[b.state] ?? '#aaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3 / zoom;
            ctx.strokeText(b.state, wx + w / 2, wy + h / 2);
            ctx.fillText(b.state, wx + w / 2, wy + h / 2);
            ctx.fillText(def.name, wx + w / 2, wy + h / 2 + 12 / zoom);
        }
        ctx.restore();
    }

    // ─── Private rendering helpers ───────────────────────────────────────────────

    _renderBuilding(ctx, camera, building, def, pass, alpha) {
        const layerData = this._layerCache.get(building.definitionId);
        if (!layerData) return;

        const tileSize = this.tilemap.tileSize;
        const bounds = camera.getVisibleBounds();

        const worldX = building.tileX * tileSize;
        const worldY = building.tileY * tileSize;
        const worldW = def.footprint.width * tileSize;
        const worldH = def.footprint.height * tileSize;

        // Cull if not visible
        if (worldX + worldW < bounds.left || worldX > bounds.right ||
            worldY + worldH < bounds.top  || worldY > bounds.bottom) return;

        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * alpha;

        for (const layer of layerData) {
            if (layer.renderPass !== pass) continue;
            for (let row = 0; row < layer.tiles.length; row++) {
                for (let col = 0; col < (layer.tiles[row]?.length ?? 0); col++) {
                    const tileId = layer.tiles[row][col];
                    if (tileId < 0) continue;
                    const src = this.tilemap.getTilesetSourceRect(tileId);
                    if (!src) continue;
                    const dx = worldX + col * tileSize;
                    const dy = worldY + row * tileSize;
                    ctx.drawImage(
                        this.tilemap.tilesetImage,
                        src.x, src.y, src.width, src.height,
                        dx, dy, tileSize, tileSize
                    );
                }
            }
        }

        ctx.globalAlpha = prevAlpha;
    }

}
