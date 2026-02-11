import { Logger } from './Logger.js';

const log = Logger.create('TileOverlayManager');

export class TileOverlayManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.overlays = new Map(); // Key: "x,y", Value: array of overlay objects
        this.hoedTiles = new Set(); // Key: "x,y", tracks which tiles are hoed
        // Edge overlay tile IDs
        this.EDGE_OVERLAYS = {
            TOP: 2118,      // Above hoed tile
            LEFT: 2244,    // Left of hoed tile
            BOTTOM: 2374,  // Below hoed tile
            RIGHT: 2248    // Right of hoed tile
        };
        this.edgeOverlaySet = new Set(Object.values(this.EDGE_OVERLAYS));
        this.HOLE_OVERLAY_ID = 1138; // Hole overlay - should be unique/replace
    }

    addOverlay(tileX, tileY, tileId, offsetY = 0) {
        const key = `${tileX},${tileY}`;
        const overlay = {
            tileX: tileX,
            tileY: tileY,
            tileId: tileId,
            offsetY: offsetY
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

    render(ctx, camera) {
        if (this.overlays.size === 0) return;

        const tileSize = this.tilemap.tileSize;

        // Get visible bounds for culling
        const bounds = camera.getVisibleBounds();
        const startCol = Math.max(0, Math.floor(bounds.left / tileSize) - 1);
        const endCol = Math.min(this.tilemap.mapWidth - 1, Math.ceil(bounds.right / tileSize) + 1);
        const startRow = Math.max(0, Math.floor(bounds.top / tileSize) - 1);
        const endRow = Math.min(this.tilemap.mapHeight - 1, Math.ceil(bounds.bottom / tileSize) + 1);

        // Render all overlays for each tile
        // Iterate through each tile position and render all its overlays
        for (const [key, overlayList] of this.overlays.entries()) {
            for (const overlay of overlayList) {
                // Check if overlay is visible
                if (overlay.tileX < startCol || overlay.tileX > endCol ||
                    overlay.tileY < startRow || overlay.tileY > endRow) {
                    continue;
                }

                const sourceRect = this.tilemap.getTilesetSourceRect(overlay.tileId);
                const worldX = overlay.tileX * tileSize;
                const worldY = (overlay.tileY + overlay.offsetY) * tileSize;

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

    // Check if a tile is a grass tile (not hoed)
    isGrassTile(tileX, tileY) {
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId === null) return false;
        
        // Grass tiles are: 65, 66, 129, 130, 131, 132, 133, 134, 192, 193, 194, 195, 197, 199, 257, 258
        const grassTileIds = new Set([65, 66, 129, 130, 131, 132, 133, 134, 192, 193, 194, 195, 197, 199, 257, 258]);
        return grassTileIds.has(tileId);
    }

    // Check if a tile is hoed (dirt tile)
    isHoedTile(tileX, tileY) {
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        if (tileId === null) return false;
        
        // Dirt tiles: 67, 449, 457, 458, 459, 521, 522
        const dirtTileIds = new Set([67, 449, 457, 458, 459, 521, 522]);
        return dirtTileIds.has(tileId);
    }

    // Mark a tile as hoed and update edge overlays
    markTileAsHoed(tileX, tileY) {
        const key = `${tileX},${tileY}`;

        // Remove all overlays from this tile (since it's no longer grass)
        this.removeAllOverlays(tileX, tileY);

        if (this.hoedTiles.has(key)) {
            // Already hoed, just update edges
            this.updateEdgeOverlays(tileX, tileY);
            return;
        }

        this.hoedTiles.add(key);
        this.updateEdgeOverlays(tileX, tileY);
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
}
