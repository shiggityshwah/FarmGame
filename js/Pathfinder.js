import { Logger } from './Logger.js';
import { CONFIG } from './config.js';

const log = Logger.create('Pathfinder');

// Path tile IDs that reduce movement cost (preferred for navigation)
const PATH_TILES = new Set(CONFIG.tiles.path);

// Cost to traverse a path tile derived from speed: faster movement = lower time cost
const PATH_TILE_COST = 1 / CONFIG.path.speedMultiplier;
// Minimum possible tile cost (used to keep heuristic admissible)
const MIN_TILE_COST = Math.min(1.0, PATH_TILE_COST);

// Define obstacle tile IDs (water, rocks, buildings, etc.)
// These are common obstacle tiles from the tileset - adjust as needed
const OBSTACLE_TILES = new Set([
    // Water tiles (typical water animation frames)
    // Note: 449 excluded - it's used as a dirt/hoed ground tile in farming
    384, 385, 386, 387, 388, 389, 390, 391,
    448, 450, 451, 452, 453, 454, 455,
    512, 513, 514, 515, 516, 517, 518, 519,
    576, 577, 578, 579, 580, 581, 582, 583,
    // Deep water
    640, 641, 642, 643, 644, 645, 646, 647,
    // Rock/cliff tiles
    768, 769, 770, 771, 832, 833, 834, 835,
    896, 897, 898, 899, 960, 961, 962, 963
]);

// MinHeap implementation for efficient A* pathfinding
// Provides O(log n) insert and extract-min operations
class MinHeap {
    constructor() {
        this.heap = [];
        this.nodeMap = new Map(); // For O(1) lookup by coordinates
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    push(node) {
        this.heap.push(node);
        const index = this.heap.length - 1;
        this.nodeMap.set(`${node.x},${node.y}`, { node, index });
        this._bubbleUp(index);
    }

    pop() {
        if (this.isEmpty()) return null;

        const min = this.heap[0];
        const last = this.heap.pop();
        this.nodeMap.delete(`${min.x},${min.y}`);

        if (!this.isEmpty()) {
            this.heap[0] = last;
            this.nodeMap.set(`${last.x},${last.y}`, { node: last, index: 0 });
            this._bubbleDown(0);
        }

        return min;
    }

    // Get node by coordinates without removing
    get(x, y) {
        const entry = this.nodeMap.get(`${x},${y}`);
        return entry ? entry.node : null;
    }

    // Update a node's f value and reposition in heap
    decreaseKey(x, y, newG, newF, newParent) {
        const key = `${x},${y}`;
        const entry = this.nodeMap.get(key);
        if (!entry) return false;

        const node = entry.node;
        node.g = newG;
        node.f = newF;
        node.parent = newParent;

        // Use cached index from nodeMap (O(1)) instead of linear scan
        this._bubbleUp(entry.index);
        return true;
    }

    _bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].f >= this.heap[parentIndex].f) break;

            this._swap(index, parentIndex);
            index = parentIndex;
        }
    }

    _bubbleDown(index) {
        const length = this.heap.length;

        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < length && this.heap[leftChild].f < this.heap[smallest].f) {
                smallest = leftChild;
            }
            if (rightChild < length && this.heap[rightChild].f < this.heap[smallest].f) {
                smallest = rightChild;
            }

            if (smallest === index) break;

            this._swap(index, smallest);
            index = smallest;
        }
    }

    _swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;

        // Update nodeMap indices
        this.nodeMap.set(`${this.heap[i].x},${this.heap[i].y}`, { node: this.heap[i], index: i });
        this.nodeMap.set(`${this.heap[j].x},${this.heap[j].y}`, { node: this.heap[j], index: j });
    }
}

export class Pathfinder {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.forestGenerator = null;
        this.treeManager = null;
        this.oreManager = null;
    }

    /**
     * Set the forest generator for extended pathfinding into forest areas
     */
    setForestGenerator(forestGenerator) {
        this.forestGenerator = forestGenerator;
    }

    /** Set the farm tree manager so trunks block pathfinding */
    setTreeManager(treeManager) {
        this.treeManager = treeManager;
    }

    /** Set the ore manager so ore vein bottom tiles block pathfinding */
    setOreManager(oreManager) {
        this.oreManager = oreManager;
    }

    findPath(startX, startY, endX, endY) {
        // A* pathfinding algorithm using MinHeap for O(n log n) performance

        // Quick check: if start or end is invalid, return null
        if (!this.isWalkable(startX, startY) || !this.isWalkable(endX, endY)) {
            // Try to find path anyway, but the end might be the work tile
            // For now, allow pathfinding to unwalkable end (we'll stop before it)
        }

        const openSet = new MinHeap();
        const closedSet = new Set();

        const startNode = {
            x: startX,
            y: startY,
            g: 0,
            h: this.heuristic(startX, startY, endX, endY),
            f: 0,
            parent: null
        };
        startNode.f = startNode.g + startNode.h;
        openSet.push(startNode);

        let iterations = 0;
        const maxIterations = CONFIG.pathfinding.maxIterations;

        while (!openSet.isEmpty() && iterations < maxIterations) {
            iterations++;

            // Extract node with lowest f score - O(log n) with heap
            const current = openSet.pop();

            // Check if reached goal
            if (current.x === endX && current.y === endY) {
                return this.reconstructPath(current);
            }

            closedSet.add(`${current.x},${current.y}`);

            // Check neighbors (4-directional movement)
            const neighbors = this.getNeighbors(current);

            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                if (closedSet.has(key)) continue;

                const tentativeG = current.g + this.getMovementCost(neighbor.x, neighbor.y);
                const existing = openSet.get(neighbor.x, neighbor.y);

                if (!existing) {
                    neighbor.g = tentativeG;
                    neighbor.h = this.heuristic(neighbor.x, neighbor.y, endX, endY);
                    neighbor.f = neighbor.g + neighbor.h;
                    neighbor.parent = current;
                    openSet.push(neighbor);
                } else if (tentativeG < existing.g) {
                    // Update existing node with better path
                    const newF = tentativeG + existing.h;
                    openSet.decreaseKey(neighbor.x, neighbor.y, tentativeG, newF, current);
                }
            }
        }

        // No path found - return null instead of fallback to prevent walking through obstacles
        log.warn('No path found from', startX, startY, 'to', endX, endY);
        return null;
    }

    heuristic(x1, y1, x2, y2) {
        // Manhattan distance scaled by minimum tile cost to stay admissible
        // This ensures A* explores path tile routes when they save travel time
        return (Math.abs(x2 - x1) + Math.abs(y2 - y1)) * MIN_TILE_COST;
    }

    isAdjacent(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        return (dx <= 1 && dy <= 1) && (dx + dy > 0);
    }

    getNeighbors(node) {
        const neighbors = [];
        const directions = [
            { dx: 0, dy: -1 },  // up
            { dx: 0, dy: 1 },   // down
            { dx: -1, dy: 0 },  // left
            { dx: 1, dy: 0 }    // right
        ];

        for (const dir of directions) {
            const nx = node.x + dir.dx;
            const ny = node.y + dir.dy;

            if (this.isWalkable(nx, ny)) {
                neighbors.push({ x: nx, y: ny });
            }
        }

        return neighbors;
    }

    isWalkable(x, y) {
        // Check if within main tilemap bounds
        const inTilemap = x >= 0 && x < this.tilemap.mapWidth && y >= 0 && y < this.tilemap.mapHeight;

        if (inTilemap) {
            const tileId = this.tilemap.getTileAt(x, y);
            if (tileId === null) return false;

            // Check if tile is an obstacle
            if (OBSTACLE_TILES.has(tileId)) return false;

            // Check boundary layer (walls, furniture in house)
            if (this.tilemap.isBoundary && this.tilemap.isBoundary(x, y)) {
                return false;
            }

            // Check forest tree trunks (covers both purchased forest chunks and
            // the farm south forest — trees are sprites over grass tiles so the
            // tile ID alone cannot detect them)
            if (this.forestGenerator && this.forestGenerator.isForestTreeTrunk(x, y)) {
                return false;
            }

            // Check farm/managed tree trunks (TreeManager trees in the south farm area)
            if (this.treeManager && this.treeManager.isTreeObstacle(x, y)) {
                return false;
            }

            // Check ore vein bottom tiles (both farm ores and forest pocket ores)
            if (this.oreManager && this.oreManager.isOreObstacle(x, y)) {
                return false;
            }
            if (this.forestGenerator && this.forestGenerator.isPocketOreObstacle(x, y)) {
                return false;
            }

            return true;
        }

        // Check forest area (outside main tilemap)
        if (this.forestGenerator) {
            return this.forestGenerator.isWalkable(x, y);
        }

        return false;
    }

    getMovementCost(x, y) {
        const inTilemap = x >= 0 && x < this.tilemap.mapWidth && y >= 0 && y < this.tilemap.mapHeight;
        if (inTilemap) {
            const tileId = this.tilemap.getTileAt(x, y);
            if (tileId !== null && PATH_TILES.has(tileId)) {
                return PATH_TILE_COST;
            }
        }
        return 1.0;
    }

    reconstructPath(node) {
        const path = [];
        let current = node;

        while (current) {
            path.unshift({ x: current.x, y: current.y });
            current = current.parent;
        }

        return path;
    }

    getDirectPath(startX, startY, endX, endY) {
        // Fallback: just return start and end
        const path = [];

        if (startX !== endX || startY !== endY) {
            path.push({ x: startX, y: startY });
        }
        path.push({ x: endX, y: endY });

        return path;
    }
}

// Export obstacle and path tiles for external use
export { OBSTACLE_TILES, PATH_TILES };
