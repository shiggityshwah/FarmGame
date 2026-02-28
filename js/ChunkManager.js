/**
 * ChunkManager - Manages the sparse chunk-based world grid
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL OVERVIEW: Sparse Dynamic Chunk System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEM SOLVED:
 * ---------------
 * Previous implementation pre-allocated a 7×8 chunk grid (210×240 tiles = 50,400 tiles)
 * at startup, causing:
 *   - Severe lag during initialization
 *   - Forest generation across massive unused area
 *   - Unnecessary memory usage (50,400 tiles vs 3,375 tiles)
 *   - Poor scalability
 *
 * SOLUTION:
 * ---------
 * This system uses SPARSE chunk storage - chunks are only allocated when:
 *   1. They are part of the initial 3×5 grid (15 chunks = 3,375 tiles)
 *   2. They are purchased by the player
 *   3. They are generated as neighbors of purchased chunks (for visibility)
 *   4. They are written to via setTileAt() (lazy allocation)
 *
 * KEY DESIGN PRINCIPLES:
 * ----------------------
 * 1. World coordinates remain STABLE - no shifting of tile arrays when expanding
 * 2. Unallocated chunks return default grass tile (65) when read via getTileAt()
 * 3. Map grows outward naturally as purchases occur
 * 4. Each chunk is self-contained (15×15 tiles)
 * 5. Chunks visually blend at edges (see TilemapRenderer._blendChunkEdges)
 *
 * INITIAL STATE:
 * --------------
 * Start with ONLY 3×5 chunks allocated (45×79 tiles = 3,375 tiles):
 *   Store: col=1, row=1  (x=15-29, y=15-29)
 *   Home:  col=1, row=2  (x=15-29, y=30-44)
 *   Farm:  col=1, row=3  (x=15-29, world y=49-63)  ← player's initial owned chunk
 *   All others: forest chunks (locked; north rows permanently locked)
 *
 * DYNAMIC GROWTH:
 * ---------------
 * When a chunk is purchased:
 *   - The purchased chunk is marked as OWNED
 *   - Its 4 direct neighbors are allocated (if they don't exist)
 *   - This ensures we can see all chunks surrounding any owned chunk
 *   - Forest generation only occurs in allocated chunks
 *
 * OWNERSHIP RULES:
 * ----------------
 *   - Owned chunks: full farming/gathering access
 *   - Town chunk: walk + weed-clear only (no farming or resource gathering)
 *   - Forest chunks: walk-through only; purchase to unlock
 *
 * PERFORMANCE BENEFITS:
 * ---------------------
 *   - Initial allocation: 3,375 tiles vs 50,400 tiles (93% reduction)
 *   - No lag spike on startup
 *   - Memory usage scales with actual world usage
 *   - Renderer uses viewport-based culling (only queries visible tiles)
 */

import { Logger } from './Logger.js';
import { CONFIG } from './config.js';

const log = Logger.create('ChunkManager');

export const CHUNK_STATES = {
    OWNED: 'owned',
    TOWN: 'town',
    PURCHASABLE: 'purchasable',
    LOCKED: 'locked'
};

export const CHUNK_TYPES = {
    FARM: 'farm',
    TOWN: 'town',
    FOREST: 'forest'
};

export class ChunkManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.chunkSize = CONFIG.chunks.size; // 30
        this.chunks = new Map(); // "col,row" → chunk object (sparse storage)

        // Callback fired when a chunk is purchased: (chunk) => void
        this.onChunkPurchased = null;

        // Pluggable biome generator registry (set from Game.js after init)
        this.generatorRegistry = null;

        // Reference to path position tracking (set from Game.js)
        this._pathPositions = null;
        this._overlayManager = null;
        this._getRandomPathTile = null;
    }

    // ─── Initialization ─────────────────────────────────────────────────────────

    /**
     * Initialize the chunk system with only 3×5 chunks allocated.
     * This replaces the old 7×8 pre-allocation (50,400 tiles → 3,375 tiles).
     */
    initialize() {
        const { storeCol, storeRow, homeCol, homeRow, farmCol, farmRow, initialGridCols, initialGridRows } = CONFIG.chunks;

        // Create ONLY the initial 3×5 chunk grid
        for (let row = 0; row < initialGridRows; row++) {
            for (let col = 0; col < initialGridCols; col++) {
                let type, state;

                if ((col === storeCol && row === storeRow) || (col === homeCol && row === homeRow)) {
                    type = CHUNK_TYPES.TOWN;
                    state = CHUNK_STATES.TOWN;
                } else if (col === farmCol && row === farmRow) {
                    type = CHUNK_TYPES.FARM;
                    state = CHUNK_STATES.OWNED;
                } else {
                    type = CHUNK_TYPES.FOREST;
                    state = CHUNK_STATES.LOCKED;
                }

                this.chunks.set(this._key(col, row), {
                    col, row, type, state, generated: true
                });
            }
        }

        // Mark chunks adjacent to owned chunks as purchasable
        this._updatePurchasableChunks();
        log.info(`ChunkManager initialized: ${initialGridCols}×${initialGridRows} sparse grid (${this.chunks.size} chunks)`);
    }

    // ─── Key / Lookup ────────────────────────────────────────────────────────────

    _key(col, row) {
        return `${col},${row}`;
    }

    getChunkAt(col, row) {
        return this.chunks.get(this._key(col, row)) || null;
    }

    /** Returns the chunk that contains the given tile coordinate. */
    getChunkForTile(tileX, tileY) {
        const { mainPathY, mainPathGap } = CONFIG.chunks;
        // Great path zone: no chunk owns these tiles
        if (tileY >= mainPathY && tileY < mainPathY + mainPathGap) return null;
        // Adjust world y to chunk-space y for rows below the great path gap
        const adjY = tileY >= mainPathY + mainPathGap ? tileY - mainPathGap : tileY;
        const col = Math.floor(tileX / this.chunkSize);
        const row = Math.floor(adjY / this.chunkSize);
        return this.getChunkAt(col, row);
    }

    /** Returns the chunk that contains the given world pixel position. */
    getChunkForWorld(worldX, worldY) {
        const tileSize = this.tilemap.tileSize;
        return this.getChunkForTile(
            Math.floor(worldX / tileSize),
            Math.floor(worldY / tileSize)
        );
    }

    // ─── Ownership Queries ───────────────────────────────────────────────────────

    /** True if the tile is in an owned (farm) chunk. */
    isPlayerOwned(tileX, tileY) {
        const chunk = this.getChunkForTile(tileX, tileY);
        return chunk !== null && chunk.state === CHUNK_STATES.OWNED;
    }

    /** True if the tile is in the town chunk. */
    isTownChunk(tileX, tileY) {
        const chunk = this.getChunkForTile(tileX, tileY);
        return chunk !== null && chunk.state === CHUNK_STATES.TOWN;
    }

    /** True if the tile allows any game activity (owned or town). */
    isAccessible(tileX, tileY) {
        const chunk = this.getChunkForTile(tileX, tileY);
        if (!chunk) return false;
        return chunk.state === CHUNK_STATES.OWNED || chunk.state === CHUNK_STATES.TOWN;
    }

    // ─── Purchasable Chunks ──────────────────────────────────────────────────────

    getPurchasableChunks() {
        const result = [];
        for (const chunk of this.chunks.values()) {
            if (chunk.state === CHUNK_STATES.PURCHASABLE) result.push(chunk);
        }
        return result;
    }

    _updatePurchasableChunks() {
        const { farmRow } = CONFIG.chunks;
        const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
        for (const chunk of this.chunks.values()) {
            if (chunk.state !== CHUNK_STATES.OWNED) continue;
            for (const { dc, dr } of dirs) {
                const neighbor = this.getChunkAt(chunk.col + dc, chunk.row + dr);
                if (neighbor && neighbor.state === CHUNK_STATES.LOCKED) {
                    // Only allow purchasing chunks at or below the farm row.
                    // North-of-great-path forest chunks are for town expansion (different mechanic).
                    if (neighbor.row >= farmRow) {
                        neighbor.state = CHUNK_STATES.PURCHASABLE;
                    }
                }
            }
        }
    }

    /**
     * Ensure a chunk exists at the given coordinates.
     * Creates it as a locked forest chunk if it doesn't exist.
     * Returns the chunk object.
     */
    _ensureChunkExists(col, row) {
        const key = this._key(col, row);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            // Resolve biome type via registry (designer-map override → weighted random).
            // Falls back to FOREST when no registry is wired.
            const type = this.generatorRegistry?.resolveType(col, row) ?? CHUNK_TYPES.FOREST;
            chunk = {
                col, row,
                type,
                state: CHUNK_STATES.LOCKED,
                generated: false
            };
            this.chunks.set(key, chunk);
        }
        return chunk;
    }

    /**
     * Allocate a tile chunk in TilemapRenderer for the given chunk coordinates.
     * This ensures the tile data exists when the chunk is created.
     */
    _allocateTileChunk(col, row) {
        if (!this.tilemap || this.tilemap.mapType !== 'chunk') return;

        const key = `${col},${row}`;
        if (this.tilemap.chunkTiles.has(key)) return; // Already allocated

        const cs = this.chunkSize;
        const chunk = new Uint16Array(cs * cs);

        // Delegate ground fill to the registered biome generator; fall back to generic grass.
        const chunkMeta = this.chunks.get(key);
        const gen = this.generatorRegistry?.getGenerator(chunkMeta?.type);
        if (gen) {
            gen.generateGround(col, row, chunk, cs);
        } else {
            const grass = CONFIG.tiles.grass;
            for (let i = 0; i < cs * cs; i++) {
                chunk[i] = grass[Math.floor(Math.random() * grass.length)];
            }
        }

        this.tilemap.chunkTiles.set(key, chunk);

        // Blend edges with neighboring chunks
        this.tilemap._blendChunkEdges(col, row, chunk);
    }

    /**
     * Update tilemap bounds to include all allocated chunks.
     * Called after chunks are purchased/allocated to expand the visible map.
     * This ensures the map ends exactly at the edge of allocated chunks (Tetris-like shape).
     */
    _updateMapBounds() {
        if (!this.tilemap || this.tilemap.mapType !== 'chunk') return;

        let minCol = Infinity, maxCol = -Infinity;
        let minRow = Infinity, maxRow = -Infinity;

        // Find bounds of all allocated chunks (both in ChunkManager and TilemapRenderer)
        for (const chunk of this.chunks.values()) {
            minCol = Math.min(minCol, chunk.col);
            maxCol = Math.max(maxCol, chunk.col);
            minRow = Math.min(minRow, chunk.row);
            maxRow = Math.max(maxRow, chunk.row);
        }

        // Also check TilemapRenderer's allocated chunks (in case setTileAt allocated some)
        if (this.tilemap.chunkTiles) {
            for (const key of this.tilemap.chunkTiles.keys()) {
                const [col, row] = key.split(',').map(Number);
                minCol = Math.min(minCol, col);
                maxCol = Math.max(maxCol, col);
                minRow = Math.min(minRow, row);
                maxRow = Math.max(maxRow, row);
            }
        }

        if (minCol === Infinity) return; // No chunks allocated

        // Set map bounds to EXACTLY match allocated chunks (no extra tiles).
        // mapStartX / mapStartY are in tile units and may be negative for worlds that
        // have expanded left/north of the initial grid.
        // Add mainPathGap to Y coords for rows below pathBoundaryRow (the great path gap).
        const { pathBoundaryRow, mainPathGap } = CONFIG.chunks;
        const chunkRowToWorldY = (r) => r * this.chunkSize + (r > pathBoundaryRow ? mainPathGap : 0);
        this.tilemap.mapStartX = minCol * this.chunkSize;                          // left edge (tile units)
        this.tilemap.mapStartY = chunkRowToWorldY(minRow);                         // top edge (tile units, may be negative)
        this.tilemap.mapWidth  = (maxCol + 1) * this.chunkSize;                    // right edge exclusive
        this.tilemap.mapHeight = chunkRowToWorldY(maxRow) + this.chunkSize;        // bottom edge exclusive

        log.debug(`Map bounds updated: (${this.tilemap.mapStartX},${this.tilemap.mapStartY}) → (${this.tilemap.mapWidth},${this.tilemap.mapHeight}) chunks(${minCol}-${maxCol}, ${minRow}-${maxRow})`);
    }

    // ─── Bounds ──────────────────────────────────────────────────────────────────

    /** Returns tile-coordinate bounding box for the chunk in WORLD coordinates. */
    getChunkBounds(col, row) {
        const { pathBoundaryRow, mainPathGap } = CONFIG.chunks;
        // Rows at or above pathBoundaryRow: world y = row * chunkSize (no gap)
        // Rows below pathBoundaryRow: world y = row * chunkSize + mainPathGap (great path gap inserted)
        const worldY = row * this.chunkSize + (row > pathBoundaryRow ? mainPathGap : 0);
        return {
            x: col * this.chunkSize,
            y: worldY,
            width: this.chunkSize,
            height: this.chunkSize
        };
    }

    /** Returns the center tile position of the chunk in WORLD coordinates. */
    getChunkCenter(col, row) {
        const bounds = this.getChunkBounds(col, row);
        return {
            tileX: bounds.x + Math.floor(this.chunkSize / 2),
            tileY: bounds.y + Math.floor(this.chunkSize / 2)
        };
    }

    // ─── Purchase ────────────────────────────────────────────────────────────────

    /**
     * Purchase a chunk and allocate its 4 direct neighbors if they don't exist.
     * This is the primary mechanism for dynamic world growth.
     */
    purchaseChunk(col, row) {
        const chunk = this.getChunkAt(col, row);
        if (!chunk || chunk.state !== CHUNK_STATES.PURCHASABLE) {
            log.warn(`Cannot purchase chunk (${col},${row}): state=${chunk?.state}`);
            return false;
        }

        chunk.state = CHUNK_STATES.OWNED;
        log.info(`Chunk (${col},${row}) purchased`);

        // Allocate all 8 neighbors (cardinal + diagonal) if they don't exist
        // This ensures we can see all chunks surrounding any owned chunk
        const dirs = [
            { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
            { dc: -1, dr: -1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: 1, dr: 1 }
        ];
        for (const { dc, dr } of dirs) {
            const neighborCol = col + dc;
            const neighborRow = row + dr;
            const neighbor = this.getChunkAt(neighborCol, neighborRow);
            if (!neighbor) {
                // Create neighbor as locked forest chunk
                this._ensureChunkExists(neighborCol, neighborRow);
                // Allocate the tile chunk in TilemapRenderer
                this._allocateTileChunk(neighborCol, neighborRow);
            }
        }

        // Expand map bounds to include all allocated chunks
        // This must happen BEFORE generating content so bounds are correct
        this._updateMapBounds();

        // Recalculate purchasable neighbors
        this._updatePurchasableChunks();

        // Fire callback so Game.js can generate chunk content
        if (this.onChunkPurchased) {
            this.onChunkPurchased(chunk);
        }

        // Mark generated AFTER callback so Game.js can use !chunk.generated as a guard
        chunk.generated = true;
        
        // Update map bounds again after content generation (in case setTileAt allocated more chunks)
        this._updateMapBounds();

        return true;
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    /**
     * Render dashed white borders around owned chunks and purchase signs on purchasable chunks.
     * Call this AFTER camera transform is applied, in world coordinates.
     */
    render(ctx, camera) {
        const tileSize = this.tilemap.tileSize;
        const bounds = camera.getVisibleBounds();
        const zoom = camera.zoom;

        // --- Owned chunk borders ---
        ctx.save();
        ctx.setLineDash([8 / zoom, 8 / zoom]);
        ctx.lineWidth = 3 / zoom;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

        for (const chunk of this.chunks.values()) {
            if (chunk.state !== CHUNK_STATES.OWNED) continue;

            const cb = this.getChunkBounds(chunk.col, chunk.row);
            const bx = cb.x * tileSize;
            const by = cb.y * tileSize;
            const bw = this.chunkSize * tileSize;
            const bh = this.chunkSize * tileSize;

            // Skip if not visible
            if (bx + bw < bounds.left || bx > bounds.right ||
                by + bh < bounds.top || by > bounds.bottom) continue;

            const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
            for (const { dc, dr } of dirs) {
                const neighbor = this.getChunkAt(chunk.col + dc, chunk.row + dr);
                const isOwnedNeighbor = neighbor && neighbor.state === CHUNK_STATES.OWNED;
                if (isOwnedNeighbor) continue; // Don't draw border between two owned chunks

                ctx.beginPath();
                if (dr === -1) { // Top border
                    ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by);
                } else if (dr === 1) { // Bottom border
                    ctx.moveTo(bx, by + bh); ctx.lineTo(bx + bw, by + bh);
                } else if (dc === -1) { // Left border
                    ctx.moveTo(bx, by); ctx.lineTo(bx, by + bh);
                } else if (dc === 1) { // Right border
                    ctx.moveTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh);
                }
                ctx.stroke();
            }
        }

        // Town chunk does NOT get a border (only owned chunks have white borders)
        ctx.restore();
    }

    /**
     * Render purchase signs ("?") on purchasable chunks.
     * Call this AFTER all tree/entity rendering so signs appear on top.
     */
    renderPurchaseSigns(ctx, camera) {
        const tileSize = this.tilemap.tileSize;
        const bounds = camera.getVisibleBounds();
        const zoom = camera.zoom;

        for (const chunk of this.chunks.values()) {
            if (chunk.state !== CHUNK_STATES.PURCHASABLE) continue;

            const center = this.getChunkCenter(chunk.col, chunk.row);
            const wx = center.tileX * tileSize + tileSize / 2;
            const wy = center.tileY * tileSize + tileSize / 2;

            // Skip if not visible
            if (wx < bounds.left || wx > bounds.right || wy < bounds.top || wy > bounds.bottom) continue;

            const r = 20 / zoom;
            ctx.save();
            ctx.beginPath();
            ctx.arc(wx, wy, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 200, 50, 0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(180, 130, 10, 0.9)';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([]);
            ctx.stroke();

            ctx.fillStyle = '#3a2000';
            ctx.font = `bold ${Math.round(18 / zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', wx, wy);
            ctx.restore();
        }
    }

    /**
     * Check if a world click hit a purchase sign. Returns the chunk if so, else null.
     * clickRadius: how close to the sign center counts as a hit (in world pixels).
     */
    getPurchasableChunkAtWorld(worldX, worldY, clickRadius = 25) {
        const tileSize = this.tilemap.tileSize;
        for (const chunk of this.chunks.values()) {
            if (chunk.state !== CHUNK_STATES.PURCHASABLE) continue;
            const center = this.getChunkCenter(chunk.col, chunk.row);
            const cx = center.tileX * tileSize + tileSize / 2;
            const cy = center.tileY * tileSize + tileSize / 2;
            const dx = worldX - cx;
            const dy = worldY - cy;
            if (dx * dx + dy * dy <= clickRadius * clickRadius) {
                return chunk;
            }
        }
        return null;
    }
}
