// Define obstacle tile IDs (water, rocks, buildings, etc.)
// These are common obstacle tiles from the tileset - adjust as needed
const OBSTACLE_TILES = new Set([
    // Water tiles (typical water animation frames)
    384, 385, 386, 387, 388, 389, 390, 391,
    448, 449, 450, 451, 452, 453, 454, 455,
    512, 513, 514, 515, 516, 517, 518, 519,
    576, 577, 578, 579, 580, 581, 582, 583,
    // Deep water
    640, 641, 642, 643, 644, 645, 646, 647,
    // Rock/cliff tiles
    768, 769, 770, 771, 832, 833, 834, 835,
    896, 897, 898, 899, 960, 961, 962, 963
]);

export class Pathfinder {
    constructor(tilemap) {
        this.tilemap = tilemap;
    }

    findPath(startX, startY, endX, endY) {
        // A* pathfinding algorithm

        // Quick check: if start or end is invalid, return null
        if (!this.isWalkable(startX, startY) || !this.isWalkable(endX, endY)) {
            // Try to find path anyway, but the end might be the work tile
            // For now, allow pathfinding to unwalkable end (we'll stop before it)
        }

        const openSet = [];
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
        const maxIterations = 1000; // Prevent infinite loops

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Find node with lowest f score
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();

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

                const tentativeG = current.g + 1;
                const existing = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);

                if (!existing) {
                    neighbor.g = tentativeG;
                    neighbor.h = this.heuristic(neighbor.x, neighbor.y, endX, endY);
                    neighbor.f = neighbor.g + neighbor.h;
                    neighbor.parent = current;
                    openSet.push(neighbor);
                } else if (tentativeG < existing.g) {
                    existing.g = tentativeG;
                    existing.f = existing.g + existing.h;
                    existing.parent = current;
                }
            }
        }

        // No path found - try direct path as fallback
        console.log('No path found, using direct movement');
        return this.getDirectPath(startX, startY, endX, endY);
    }

    heuristic(x1, y1, x2, y2) {
        // Manhattan distance
        return Math.abs(x2 - x1) + Math.abs(y2 - y1);
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
        // Check bounds
        if (x < 0 || x >= this.tilemap.mapWidth || y < 0 || y >= this.tilemap.mapHeight) {
            return false;
        }

        const tileId = this.tilemap.getTileAt(x, y);
        if (tileId === null) return false;

        // Check if tile is an obstacle
        return !OBSTACLE_TILES.has(tileId);
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

// Export obstacle tiles for external use
export { OBSTACLE_TILES };
