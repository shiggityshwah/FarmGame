import { Logger } from './Logger.js';

const log = Logger.create('RoadsideStand');

export class RoadsideStand {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.tileSize = tilemap.tileSize;   // 16
        this.tileX = 23;                    // world tile X of left edge (east of house path at x=22)
        this.tileY = 49;                    // world tile Y of base row (farm chunk north edge = mainPathY+mainPathGap)
        this.width = 4;                     // tiles wide

        // Tile IDs for base row (ground level) and banner row (above characters)
        this.baseTiles   = [2469, 2470, 2470, 2471];
        this.bannerTiles = [2405, 2406, 2406, 2407];

        // 6 item slots: indices 0–2 over tile x=24, indices 3–5 over tile x=25
        // autoReplenish: when true, automatically refill the slot after a sale if a spare item exists
        this.slots = Array.from({ length: 6 }, () => ({ resource: null, autoReplenish: false }));

        // Pre-computed world-pixel X centers for each slot
        // 3 slots per 16px tile → each slot is tileSize/3 ≈ 5.33px wide
        this.slotCentersX = this._computeSlotCenters();

        // Pre-computed obstacle key set for O(1) pathfinder lookups
        this._obstacleSet = new Set([
            `${this.tileX + 1},${this.tileY}`,  // x=24, y=49
            `${this.tileX + 2},${this.tileY}`   // x=25, y=49
        ]);

        // Set by Game.js — called when a traveler arrives and stops at the stand
        this._onTravelerArrived = null;
    }

    _computeSlotCenters() {
        const centers = [];
        const segW = this.tileSize / 3;
        for (const tileX of [this.tileX + 1, this.tileX + 2]) {
            for (let i = 0; i < 3; i++) {
                centers.push(tileX * this.tileSize + (i + 0.5) * segW);
            }
        }
        return centers;
    }

    // No longer writes into the tilemap — stand base is rendered as an overlay
    // so the underlying grass tiles remain visible beneath any transparent pixels.
    placeTiles() {
        log.debug(`Stand base rendered as overlay at (${this.tileX},${this.tileY})`);
    }

    // Register a click-detection bounding box on the tilemap's interactables list
    registerInteractable() {
        this.tilemap.interactables.push({
            x: this.tileX * this.tileSize,
            y: this.tileY * this.tileSize,
            width: this.width * this.tileSize,
            height: this.tileSize,
            action: 'openStand'
        });
        log.debug('Stand interactable registered');
    }

    // Pathfinder calls this to block the two middle (2470) tiles
    isObstacle(x, y) {
        return this._obstacleSet.has(`${x},${y}`);
    }

    // --- Slot management ---

    getListedResourceIds() {
        return this.slots.filter(s => s.resource).map(s => s.resource.id);
    }

    hasResource(resourceId) {
        return this.slots.some(s => s.resource?.id === resourceId);
    }

    clearSlot(i) {
        this.slots[i] = { resource: null, autoReplenish: false };
    }

    // --- Geometry helpers ---

    getSlotWorldX(i) { return this.slotCentersX[i]; }

    // Tile X of the 2470 tile that owns this slot (40 for slots 0–2, 41 for slots 3–5)
    getSlotTileX(i) { return i < 3 ? this.tileX + 1 : this.tileX + 2; }

    // Workers stand one tile south of the stand base (y=65)
    getServiceTileY() { return this.tileY + 1; }

    // Depth-sort: bottom edge of stand base tile
    getSortY() { return (this.tileY + 1) * this.tileSize; }

    // --- Rendering ---

    // Base row (y=49): rendered in the depth-sorted pass, OVER the grass tile layer.
    // Drawing here (rather than via setTileAt) preserves the grass beneath transparent pixels.
    renderBase(ctx) {
        if (!this.tilemap.tilesetImage) return;
        const ts = this.tileSize;
        const wy = this.tileY * ts;  // y=49 → pixel 784
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < 4; i++) {
            const src = this.tilemap.getTilesetSourceRect(this.baseTiles[i]);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                src.x, src.y, src.width, src.height,
                (this.tileX + i) * ts, wy, ts, ts
            );
        }
    }

    // Banner row (y=48): rendered in the upper-layers pass, ABOVE all characters.
    // The great path's S-grass at y=48 is drawn first; the banner overwrites it.
    renderBanner(ctx) {
        if (!this.tilemap.tilesetImage) return;
        const ts = this.tileSize;
        const wy = (this.tileY - 1) * ts;  // y=48 → pixel 768
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < 4; i++) {
            const src = this.tilemap.getTilesetSourceRect(this.bannerTiles[i]);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                src.x, src.y, src.width, src.height,
                (this.tileX + i) * ts, wy, ts, ts
            );
        }
    }

    // Item icons on the table surface: rendered in depth-sorted pass at sortY=1040.
    // Each icon is 1/3 of a tile wide (~5.3px), centered in its slot's third of the tile.
    renderTableItems(ctx) {
        if (!this.tilemap.tilesetImage) return;
        const ts = this.tileSize;
        const itemSize = ts / 3;
        const baseWorldY = this.tileY * ts;
        ctx.imageSmoothingEnabled = false;
        for (let i = 0; i < 6; i++) {
            const r = this.slots[i].resource;
            if (!r) continue;
            const src = this.tilemap.getTilesetSourceRect(r.tileId);
            const dx = this.slotCentersX[i] - itemSize / 2;
            const dy = baseWorldY + (ts - itemSize) / 2;
            ctx.drawImage(
                this.tilemap.tilesetImage,
                src.x, src.y, src.width, src.height,
                dx, dy, itemSize, itemSize
            );
        }
    }
}
