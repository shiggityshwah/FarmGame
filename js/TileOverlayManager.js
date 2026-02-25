import { Logger } from './Logger.js';
import { CONFIG } from './config.js';

const log = Logger.create('TileOverlayManager');

// Static tile ID sets — derived from CONFIG so there is a single source of truth
const GRASS_TILE_IDS = new Set(CONFIG.tiles.grass);
const HOED_TILE_IDS  = new Set(CONFIG.tiles.hoedGround);

export class TileOverlayManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.overlays = new Map(); // Key: "x,y", Value: array of overlay objects
        this.hoedTiles = new Set(); // Key: "x,y", tracks which tiles are hoed
        this.forestGenerator = null; // Reference to ForestGenerator for checking forest grass tiles
        // Edge overlay tile IDs
        this.EDGE_OVERLAYS = {
            TOP: 2118,      // Above hoed tile
            LEFT: 2244,    // Left of hoed tile
            BOTTOM: 2374,  // Below hoed tile
            RIGHT: 2248    // Right of hoed tile
        };
        this.edgeOverlaySet = new Set(Object.values(this.EDGE_OVERLAYS));
        this.HOLE_OVERLAY_ID = 1138; // Hole overlay - should be unique/replace

        // Path tile system
        this.pathTileIds = new Set(CONFIG.tiles.path);
        this.PATH_EDGE_OVERLAYS = CONFIG.tiles.pathEdgeOverlays;
        this.pathEdgeOverlaySet = new Set(Object.values(this.PATH_EDGE_OVERLAYS));
        // Add path edge overlay IDs to main edgeOverlaySet for addOverlay dedup
        for (const tileId of this.pathEdgeOverlaySet) {
            this.edgeOverlaySet.add(tileId);
        }
        this.pathTiles = new Set(); // Key: "x,y"
        // Pixel offsets to shift path edge overlays toward the seam
        this.PATH_EDGE_OFFSETS = {
            'N': { x: 0, y: -2 },
            'E': { x: 2, y: 0 },
            'S': { x: 0, y: 2 },
            'W': { x: -2, y: 0 },
            'N+E': { x: 2, y: -2 },
            'N+W': { x: -2, y: -2 },
            'E+S': { x: 2, y: 2 },
            'W+S': { x: -2, y: 2 }
        };
    }

    addOverlay(tileX, tileY, tileId, offsetY = 0, offsetXPx = 0, offsetYPx = 0) {
        const key = `${tileX},${tileY}`;
        const overlay = {
            tileX: tileX,
            tileY: tileY,
            tileId: tileId,
            offsetY: offsetY,
            offsetXPx: offsetXPx,
            offsetYPx: offsetYPx
        };

        if (!this.overlays.has(key)) {
            this.overlays.set(key, []);
        }

        const overlayList = this.overlays.get(key);

        // Handle hole overlay (1138) - should be unique and replace any existing hole
        if (tileId === this.HOLE_OVERLAY_ID) {
            // Remove any existing hole overlay
            const holeIndex = overlayList.findIndex(o => o.tileId === this.HOLE_OVERLAY_ID);
            if (holeIndex !== -1) {
                overlayList.splice(holeIndex, 1);
            }
            // Add the new hole overlay
            overlayList.push(overlay);
            log.debug(`Hole overlay added at (${tileX}, ${tileY})`);
            return;
        }

        // For edge overlays, add them additively (multiple edge overlays can coexist)
        if (this.edgeOverlaySet.has(tileId)) {
            // Don't add duplicate edge overlays of the same type
            if (overlayList.some(o => o.tileId === tileId)) {
                return;
            }
            // Add the edge overlay (different edge types can coexist on the same tile)
            overlayList.push(overlay);
            log.debug(`Edge overlay added at (${tileX}, ${tileY}): tile ${tileId}`);
            return;
        }

        // For other non-edge overlays, replace any existing non-edge overlay (except holes, which are handled above)
        const nonEdgeIndex = overlayList.findIndex(o => 
            !this.edgeOverlaySet.has(o.tileId) && o.tileId !== this.HOLE_OVERLAY_ID
        );
        if (nonEdgeIndex !== -1) {
            overlayList.splice(nonEdgeIndex, 1);
        }
        overlayList.push(overlay);
        log.debug(`Overlay added at (${tileX}, ${tileY}): tile ${tileId}`);
    }

    removeOverlay(tileX, tileY, tileId = null) {
        const key = `${tileX},${tileY}`;
        if (!this.overlays.has(key)) return false;

        const overlayList = this.overlays.get(key);

        if (tileId === null) {
            // Remove all non-edge overlays (holes, etc.) but keep edge overlays
            const initialLength = overlayList.length;
            const filtered = overlayList.filter(o => this.edgeOverlaySet.has(o.tileId));
            if (filtered.length === 0) {
                this.overlays.delete(key);
            } else {
                this.overlays.set(key, filtered);
            }
            if (filtered.length < initialLength) {
                log.debug(`Non-edge overlay removed at (${tileX}, ${tileY})`);
                return true;
            }
            return false;
        } else {
            // Remove specific overlay type
            const index = overlayList.findIndex(o => o.tileId === tileId);
            if (index !== -1) {
                overlayList.splice(index, 1);
                if (overlayList.length === 0) {
                    this.overlays.delete(key);
                }
                log.debug(`Overlay ${tileId} removed at (${tileX}, ${tileY})`);
                return true;
            }
            return false;
        }
    }

    removeAllOverlays(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        if (this.overlays.has(key)) {
            this.overlays.delete(key);
            log.debug(`All overlays removed at (${tileX}, ${tileY})`);
            return true;
        }
        return false;
    }

    hasOverlay(tileX, tileY, tileId = null) {
        const key = `${tileX},${tileY}`;
        if (!this.overlays.has(key)) return false;

        const overlayList = this.overlays.get(key);
        if (tileId === null) {
            // Check for any non-edge overlay (like holes)
            return overlayList.some(o => !this.edgeOverlaySet.has(o.tileId));
        }
        // Check for specific overlay type
        return overlayList.some(o => o.tileId === tileId);
    }

    getOverlay(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        if (!this.overlays.has(key)) return null;

        // Return the first non-edge overlay (for compatibility with plant tool check)
        // Prefer hole overlay if it exists
        const overlayList = this.overlays.get(key);
        const holeOverlay = overlayList.find(o => o.tileId === this.HOLE_OVERLAY_ID);
        if (holeOverlay) return holeOverlay;
        
        const nonEdgeOverlay = overlayList.find(o => !this.edgeOverlaySet.has(o.tileId));
        return nonEdgeOverlay || null;
    }

    clearAllOverlays() {
        this.overlays.clear();
    }

    // Returns the visible tile range for culling overlays.
    // Called at most once per render pass and shared across all three render methods.
    _getVisibleTileRange(camera, bounds) {
        const tileSize = this.tilemap.tileSize;
        const b = bounds || camera.getVisibleBounds();
        return {
            startCol: Math.floor(b.left  / tileSize) - 1,
            endCol:   Math.ceil(b.right  / tileSize) + 1,
            startRow: Math.floor(b.top   / tileSize) - 1,
            endRow:   Math.ceil(b.bottom / tileSize) + 1,
        };
    }

    render(ctx, camera, bounds = null) {
        if (this.overlays.size === 0) return;

        const tileSize = this.tilemap.tileSize;
        const { startCol, endCol, startRow, endRow } = this._getVisibleTileRange(camera, bounds);

        for (const [key, overlayList] of this.overlays.entries()) {
            for (const overlay of overlayList) {
                if (overlay.tileX < startCol || overlay.tileX > endCol ||
                    overlay.tileY < startRow || overlay.tileY > endRow) {
                    continue;
                }

                const sourceRect = this.tilemap.getTilesetSourceRect(overlay.tileId);
                const worldX = overlay.tileX * tileSize + (overlay.offsetXPx || 0);
                const worldY = (overlay.tileY + overlay.offsetY) * tileSize + (overlay.offsetYPx || 0);

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }
        }
    }

    // Render only edge overlays (for rendering before tree/rock bottoms)
    renderEdgeOverlays(ctx, camera, bounds = null) {
        if (this.overlays.size === 0) return;

        const tileSize = this.tilemap.tileSize;
        const { startCol, endCol, startRow, endRow } = this._getVisibleTileRange(camera, bounds);

        for (const [key, overlayList] of this.overlays.entries()) {
            for (const overlay of overlayList) {
                if (!this.edgeOverlaySet.has(overlay.tileId)) continue;

                if (overlay.tileX < startCol || overlay.tileX > endCol ||
                    overlay.tileY < startRow || overlay.tileY > endRow) {
                    continue;
                }

                const sourceRect = this.tilemap.getTilesetSourceRect(overlay.tileId);
                const worldX = overlay.tileX * tileSize + (overlay.offsetXPx || 0);
                const worldY = (overlay.tileY + overlay.offsetY) * tileSize + (overlay.offsetYPx || 0);

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }
        }
    }

    // Render only non-edge overlays (holes, etc.) - for rendering after tree/rock bottoms
    renderNonEdgeOverlays(ctx, camera, bounds = null) {
        if (this.overlays.size === 0) return;

        const tileSize = this.tilemap.tileSize;
        const { startCol, endCol, startRow, endRow } = this._getVisibleTileRange(camera, bounds);

        for (const [key, overlayList] of this.overlays.entries()) {
            for (const overlay of overlayList) {
                if (this.edgeOverlaySet.has(overlay.tileId)) continue;

                if (overlay.tileX < startCol || overlay.tileX > endCol ||
                    overlay.tileY < startRow || overlay.tileY > endRow) {
                    continue;
                }

                const sourceRect = this.tilemap.getTilesetSourceRect(overlay.tileId);
                const worldX = overlay.tileX * tileSize + (overlay.offsetXPx || 0);
                const worldY = (overlay.tileY + overlay.offsetY) * tileSize + (overlay.offsetYPx || 0);

                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX, worldY, tileSize, tileSize
                );
            }
        }
    }

    getOverlayCount() {
        let count = 0;
        for (const overlayList of this.overlays.values()) {
            count += overlayList.length;
        }
        return count;
    }

    // Set reference to ForestGenerator for checking forest grass tiles
    setForestGenerator(forestGenerator) {
        this.forestGenerator = forestGenerator;
    }

    // Check if a tile is a grass tile (not hoed)
    isGrassTile(tileX, tileY) {
        // First check main tilemap
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId !== null) {
            if (GRASS_TILE_IDS.has(tileId)) return true;
        }

        // If not in main tilemap, check forest grass layer
        if (this.forestGenerator) {
            const forestTileId = this.forestGenerator.getGrassTileAt(tileX, tileY);
            if (forestTileId !== null) {
                return GRASS_TILE_IDS.has(forestTileId);
            }
        }

        return false;
    }

    // Check if a tile is hoed (dirt tile)
    isHoedTile(tileX, tileY) {
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId === null) return false;
        return HOED_TILE_IDS.has(tileId);
    }

    // Mark a tile as hoed and update edge overlays
    markTileAsHoed(tileX, tileY) {
        const key = `${tileX},${tileY}`;

        // Remove all overlays from this tile (since it's no longer grass)
        this.removeAllOverlays(tileX, tileY);

        if (this.hoedTiles.has(key)) {
            // Already hoed, just update edges
            this.updateEdgeOverlays(tileX, tileY);
            // Restore path edge overlays if adjacent to path
            this.recalculatePathEdgeOverlay(tileX, tileY);
            return;
        }

        this.hoedTiles.add(key);
        this.updateEdgeOverlays(tileX, tileY);
        // Restore path edge overlays if adjacent to path
        this.recalculatePathEdgeOverlay(tileX, tileY);
    }

    // Update edge overlays around a hoed tile
    updateEdgeOverlays(tileX, tileY) {
        // Check all four directions and update overlays
        // 2118 on grass above, 2244 on grass left, 2374 on grass below, 2248 on grass right
        const neighbors = [
            { x: tileX, y: tileY - 1, overlayId: this.EDGE_OVERLAYS.TOP },     // Above hoed tile → 2118
            { x: tileX - 1, y: tileY, overlayId: this.EDGE_OVERLAYS.LEFT },    // Left of hoed tile → 2244
            { x: tileX, y: tileY + 1, overlayId: this.EDGE_OVERLAYS.BOTTOM },  // Below hoed tile → 2374
            { x: tileX + 1, y: tileY, overlayId: this.EDGE_OVERLAYS.RIGHT }    // Right of hoed tile → 2248
        ];

        for (const neighbor of neighbors) {
            if (this.isGrassTile(neighbor.x, neighbor.y)) {
                // Add overlay to grass tile adjacent to hoed tile (addOverlay handles duplicates)
                this.addOverlay(neighbor.x, neighbor.y, neighbor.overlayId);
            }
            // Don't remove edge overlays here - they might be from other hoed tiles
        }
    }

    // Remove edge overlay from a grass tile for a specific direction
    removeEdgeOverlay(tileX, tileY, overlayId) {
        this.removeOverlay(tileX, tileY, overlayId);
    }

    // Update all edge overlays (call when hoed tiles change)
    updateAllEdgeOverlays() {
        // Clear all edge overlays first
        for (const [key, overlayList] of this.overlays.entries()) {
            const filtered = overlayList.filter(o => !this.edgeOverlaySet.has(o.tileId));
            if (filtered.length === 0) {
                this.overlays.delete(key);
            } else {
                this.overlays.set(key, filtered);
            }
        }

        // Re-add edge overlays for all hoed tiles
        for (const key of this.hoedTiles) {
            const [x, y] = key.split(',').map(Number);
            this.updateEdgeOverlays(x, y);
        }
    }

    // Check if a tile is a path tile
    isPathTile(tileX, tileY) {
        // Also check explicitly registered path tiles (e.g. virtual great path crossing tiles)
        if (this.pathTiles.has(`${tileX},${tileY}`)) return true;
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId === null) return false;
        return this.pathTileIds.has(tileId);
    }

    // Mark a tile as a path tile and update edge overlays on neighbors
    markTileAsPath(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        this.removeAllOverlays(tileX, tileY);

        if (this.pathTiles.has(key)) {
            this.updatePathEdgeOverlays(tileX, tileY);
            return;
        }

        this.pathTiles.add(key);
        this.updatePathEdgeOverlays(tileX, tileY);
    }

    // Update path edge overlays for neighbors around a path tile
    updatePathEdgeOverlays(tileX, tileY) {
        const neighbors = [
            { x: tileX, y: tileY - 1 },
            { x: tileX + 1, y: tileY },
            { x: tileX, y: tileY + 1 },
            { x: tileX - 1, y: tileY }
        ];

        for (const neighbor of neighbors) {
            if (!this.isPathTile(neighbor.x, neighbor.y)) {
                this.recalculatePathEdgeOverlay(neighbor.x, neighbor.y);
            }
        }
    }

    // Recalculate the path edge overlay for a non-path tile
    // Works on grass and hoed ground so overlays persist through hoeing
    recalculatePathEdgeOverlay(tileX, tileY) {
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId === null) return;
        if (this.pathTileIds.has(tileId)) return;

        // Remove existing path edge overlays on this tile
        this.removePathEdgeOverlays(tileX, tileY);

        // Check which cardinal directions have a path tile neighbor
        const directions = [];
        if (this.isPathTile(tileX, tileY - 1)) directions.push('N');
        if (this.isPathTile(tileX + 1, tileY)) directions.push('E');
        if (this.isPathTile(tileX, tileY + 1)) directions.push('S');
        if (this.isPathTile(tileX - 1, tileY)) directions.push('W');

        if (directions.length === 0) return;

        // Build combination key (N, E, S, W order)
        const key = directions.join('+');
        const overlayTileId = this.PATH_EDGE_OVERLAYS[key];
        const offsets = this.PATH_EDGE_OFFSETS[key] || { x: 0, y: 0 };

        if (overlayTileId !== undefined) {
            this.addOverlay(tileX, tileY, overlayTileId, 0, offsets.x, offsets.y);
        } else {
            // Fallback: add individual direction overlays for unmapped combos
            for (const dir of directions) {
                const singleOverlay = this.PATH_EDGE_OVERLAYS[dir];
                const singleOffsets = this.PATH_EDGE_OFFSETS[dir] || { x: 0, y: 0 };
                if (singleOverlay !== undefined) {
                    this.addOverlay(tileX, tileY, singleOverlay, 0, singleOffsets.x, singleOffsets.y);
                }
            }
        }
    }

    // Remove all path edge overlays from a tile
    removePathEdgeOverlays(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        if (!this.overlays.has(key)) return;

        const overlayList = this.overlays.get(key);
        const filtered = overlayList.filter(o => !this.pathEdgeOverlaySet.has(o.tileId));
        if (filtered.length === 0) {
            this.overlays.delete(key);
        } else {
            this.overlays.set(key, filtered);
        }
    }

    // Rebuild all path edge overlays
    updateAllPathEdgeOverlays() {
        // Clear existing path edge overlays
        for (const [key, overlayList] of this.overlays.entries()) {
            const filtered = overlayList.filter(o => !this.pathEdgeOverlaySet.has(o.tileId));
            if (filtered.length === 0) {
                this.overlays.delete(key);
            } else {
                this.overlays.set(key, filtered);
            }
        }

        // Re-add path edge overlays for all tracked path tiles
        for (const key of this.pathTiles) {
            const [x, y] = key.split(',').map(Number);
            this.updatePathEdgeOverlays(x, y);
        }
    }
}
