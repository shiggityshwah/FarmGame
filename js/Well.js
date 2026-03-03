import { Logger } from './Logger.js';

const log = Logger.create('Well');

/**
 * Well — a 2×3-tile structure placed on the farm chunk east of the house.
 *
 * Layout (tileX=24, tileY=53):
 *   (24,53) (25,53)  — top row: tiles 1256, 1257. Visual only, rendered ABOVE characters.
 *                       These tiles do NOT block movement or tool actions.
 *   (24,54) (25,54)  — middle row: tiles 1320, 1321. Blocks movement + actions.
 *   (24,55) (25,55)  — bottom row: tiles 1384, 1385. Blocks movement + actions.
 *
 * Rendering:
 *   renderBase() — middle + bottom rows, called in the depth-sorted entity pass.
 *   renderTop()  — top row, called after renderUpperLayers() so it appears above characters.
 */
export class Well {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.tileSize = tilemap.tileSize;  // 16

        // Top-left corner of the well (top row)
        this.tileX = 24;
        this.tileY = 53;

        // Tile IDs (from main tileset)
        this.topTiles = [1256, 1257];   // y = tileY     — above characters
        this.midTiles = [1320, 1321];   // y = tileY + 1 — ground, blocking
        this.botTiles = [1384, 1385];   // y = tileY + 2 — ground, blocking

        // Obstacle set covers middle + bottom rows only (top row is walkable)
        this._obstacleSet = new Set([
            `${this.tileX},${this.tileY + 1}`,   `${this.tileX + 1},${this.tileY + 1}`,
            `${this.tileX},${this.tileY + 2}`,   `${this.tileX + 1},${this.tileY + 2}`
        ]);
    }

    /** Returns true if the tile at (x, y) is blocked by the well's solid rows. */
    isObstacle(x, y) {
        return this._obstacleSet.has(`${x},${y}`);
    }

    /**
     * Returns the best adjacent walkable tile for characters to stand at while using the well.
     * Uses the tile west of the middle row (x=23, y=54) — clear of obstacles.
     */
    getAdjacentServiceTile() {
        return { x: this.tileX - 1, y: this.tileY + 1 };
    }

    /**
     * Register a clickable interactable covering the middle + bottom rows.
     * Clicking opens the well popup (action: 'openWell').
     */
    registerInteractable() {
        const ts = this.tileSize;
        this.tilemap.interactables.push({
            x:      this.tileX * ts,
            y:      (this.tileY + 1) * ts,
            width:  2 * ts,
            height: 2 * ts,
            action: 'openWell'
        });
        log.debug(`Well interactable registered at tile (${this.tileX}, ${this.tileY + 1})`);
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    /**
     * Render the middle and bottom rows of the well.
     * Called in the depth-sorted entity pass at getSortY().
     */
    renderBase(ctx) {
        if (!this.tilemap.tilesetImage) return;
        const ts = this.tileSize;
        ctx.imageSmoothingEnabled = false;

        const rows = [
            { tiles: this.midTiles, y: this.tileY + 1 },
            { tiles: this.botTiles, y: this.tileY + 2 }
        ];
        for (const { tiles, y } of rows) {
            for (let i = 0; i < tiles.length; i++) {
                const src = this.tilemap.getTilesetSourceRect(tiles[i]);
                ctx.drawImage(
                    this.tilemap.tilesetImage,
                    src.x, src.y, src.width, src.height,
                    (this.tileX + i) * ts, y * ts, ts, ts
                );
            }
        }
    }

    /**
     * Render the top row of the well ABOVE characters.
     * Called after renderUpperLayers() — same pass as the stand banner.
     */
    renderTop(ctx) {
        if (!this.tilemap.tilesetImage) return;
        const ts = this.tileSize;
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < this.topTiles.length; i++) {
            const src = this.tilemap.getTilesetSourceRect(this.topTiles[i]);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                src.x, src.y, src.width, src.height,
                (this.tileX + i) * ts, this.tileY * ts, ts, ts
            );
        }
    }

    /** Depth sort key: bottom edge of the bottom row. */
    getSortY() {
        return (this.tileY + 3) * this.tileSize;
    }
}
