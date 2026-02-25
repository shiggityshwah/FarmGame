/**
 * TileUtils — pure, stateless helpers for coordinate conversion and distance.
 *
 * All functions are side-effect-free and safe to call on any hot path.
 * Import only what you need — tree-shaking friendly.
 */

/** Convert a world pixel coordinate to a tile index (floors toward −∞). */
export function worldToTile(px, tileSize) {
    return Math.floor(px / tileSize);
}

/** Convert a tile index to the world pixel of its top-left corner. */
export function tileToWorld(tx, tileSize) {
    return tx * tileSize;
}

/** World pixel of the center of a tile. */
export function tileCenterWorld(tx, tileSize) {
    return tx * tileSize + tileSize / 2;
}

/** Manhattan distance between two tile positions. */
export function manhattanDist(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
}
