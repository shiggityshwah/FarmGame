import { CONFIG } from './config.js';
import { Logger } from './Logger.js';

const log = Logger.create('PathConnectivity');

/**
 * BFS utility that determines whether a tile is connected to the great path
 * (world y = mainPathY … mainPathY + mainPathGap - 1) via path tiles.
 *
 * Path tiles are detected by tilemap tile ID (covers pre-generated paths AND
 * player-placed paths once setTileAt is called). `playerPlacedPaths` is used
 * ONLY to determine pickaxe-removability, not for BFS — we already detect them
 * via the tilemap tile ID.
 */
export class PathConnectivity {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.playerPlacedPaths = new Set(); // "tileX,tileY" — for removal eligibility
        this._cache = new Map();            // "tileX,tileY" → boolean
    }

    setPlayerPlacedPaths(pathsSet) {
        this.playerPlacedPaths = pathsSet;
    }

    invalidate() {
        this._cache.clear();
    }

    /** Returns true if the given tile has a path tile ID or is on the great path strip. */
    isPathTile(tileX, tileY) {
        const { mainPathY, mainPathGap } = CONFIG.chunks;
        // Great path strip rows are always walkable path
        if (tileY >= mainPathY && tileY < mainPathY + mainPathGap) return true;
        // Check tilemap tile ID
        const tileId = this.tilemap.getTileAt(tileX, tileY);
        return tileId !== null && CONFIG.tiles.path.includes(tileId);
    }

    /**
     * BFS from startTile. Returns true if any reachable path tile is on the
     * great path strip (y in [mainPathY, mainPathY + mainPathGap)).
     * Results are cached per starting tile; call invalidate() after any path change.
     */
    isConnectedToGreatPath(startTileX, startTileY) {
        const key = `${startTileX},${startTileY}`;
        if (this._cache.has(key)) return this._cache.get(key);

        const result = this._bfs(startTileX, startTileY);
        this._cache.set(key, result);
        return result;
    }

    _bfs(startX, startY) {
        const { mainPathY, mainPathGap } = CONFIG.chunks;

        if (!this.isPathTile(startX, startY)) {
            // Starting tile is not a path — check if it's immediately adjacent to one
            // (building doors may be on grass, but door+1 south should be checked)
            return false;
        }

        const visited = new Set();
        const queue = [[startX, startY]];
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const k = `${x},${y}`;
            if (visited.has(k)) continue;
            visited.add(k);

            // Target: great path rows
            if (y >= mainPathY && y < mainPathY + mainPathGap) {
                return true;
            }

            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                const nk = `${nx},${ny}`;
                if (!visited.has(nk) && this.isPathTile(nx, ny)) {
                    queue.push([nx, ny]);
                }
            }
        }
        return false;
    }
}
