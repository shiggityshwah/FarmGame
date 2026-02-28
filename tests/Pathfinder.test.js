/**
 * Unit tests for Pathfinder system
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { Pathfinder, OBSTACLE_TILES } from '../js/Pathfinder.js';

// Get an obstacle tile ID for testing
const WATER_TILE = 384; // Known water tile from OBSTACLE_TILES
const GRASS_TILE = 1;   // Non-obstacle tile

// Mock tilemap for testing
class MockTilemap {
    constructor(width, height, obstacles = []) {
        this.mapWidth = width;
        this.mapHeight = height;
        this.tileSize = 16;
        // Store obstacles as a set of "x,y" strings
        this.obstacles = new Set(obstacles.map(([x, y]) => `${x},${y}`));
    }

    getTileAt(tileX, tileY) {
        // Out of bounds
        if (tileX < 0 || tileX >= this.mapWidth || tileY < 0 || tileY >= this.mapHeight) {
            return null;
        }
        // Return water tile for obstacles, grass for walkable
        if (this.obstacles.has(`${tileX},${tileY}`)) {
            return WATER_TILE;
        }
        return GRASS_TILE;
    }

    // Optional boundary check (not all tilemaps have this)
    isBoundary(x, y) {
        return false;
    }
}

describe('Pathfinder', () => {
    let pathfinder;
    let tilemap;

    beforeEach(() => {
        // Create a 10x10 open tilemap
        tilemap = new MockTilemap(10, 10);
        pathfinder = new Pathfinder(tilemap);
    });

    // === Basic Pathfinding ===

    it('should find a direct path with no obstacles', () => {
        const path = pathfinder.findPath(0, 0, 5, 0);

        expect(path).not.toBeNull();
        expect(path.length).toBeGreaterThan(0);
        // Path should end at destination
        expect(path[path.length - 1].x).toBe(5);
        expect(path[path.length - 1].y).toBe(0);
    });

    it('should find a path to diagonal location', () => {
        const path = pathfinder.findPath(0, 0, 3, 3);

        expect(path).not.toBeNull();
        expect(path.length).toBeGreaterThan(0);
        expect(path[path.length - 1].x).toBe(3);
        expect(path[path.length - 1].y).toBe(3);
    });

    it('should return path with single tile when start equals end', () => {
        const path = pathfinder.findPath(3, 3, 3, 3);

        expect(path).not.toBeNull();
        expect(path.length).toBe(1);
        expect(path[0].x).toBe(3);
        expect(path[0].y).toBe(3);
    });

    it('should include start tile in path', () => {
        const path = pathfinder.findPath(0, 0, 2, 0);

        expect(path).not.toBeNull();
        // Path includes start position
        expect(path[0].x).toBe(0);
        expect(path[0].y).toBe(0);
    });

    // === Obstacle Avoidance ===

    it('should navigate around a single obstacle', () => {
        // Create tilemap with obstacle at (2, 0) blocking direct path
        tilemap = new MockTilemap(10, 10, [[2, 0]]);
        pathfinder = new Pathfinder(tilemap);

        const path = pathfinder.findPath(0, 0, 4, 0);

        expect(path).not.toBeNull();
        // Path should not contain the obstacle
        const containsObstacle = path.some(p => p.x === 2 && p.y === 0);
        expect(containsObstacle).toBe(false);
        // Path should end at destination
        expect(path[path.length - 1].x).toBe(4);
        expect(path[path.length - 1].y).toBe(0);
    });

    it('should navigate around a wall of obstacles', () => {
        // Create a vertical wall at x=2 from y=0 to y=3
        const obstacles = [[2, 0], [2, 1], [2, 2], [2, 3]];
        tilemap = new MockTilemap(10, 10, obstacles);
        pathfinder = new Pathfinder(tilemap);

        const path = pathfinder.findPath(0, 1, 4, 1);

        expect(path).not.toBeNull();
        // Path should go around the wall (above or below)
        const containsWall = path.some(p => p.x === 2 && p.y >= 0 && p.y <= 3);
        expect(containsWall).toBe(false);
        expect(path[path.length - 1].x).toBe(4);
        expect(path[path.length - 1].y).toBe(1);
    });

    it('should return null when destination is completely blocked', () => {
        // Completely surround destination with obstacles
        const obstacles = [
            [4, 4], [5, 4], [6, 4],
            [4, 5], /* 5,5 is dest */ [6, 5],
            [4, 6], [5, 6], [6, 6]
        ];
        tilemap = new MockTilemap(10, 10, obstacles);
        pathfinder = new Pathfinder(tilemap);

        const path = pathfinder.findPath(0, 0, 5, 5);

        expect(path).toBeNull();
    });

    it('should allow pathfinding from obstacle tile (game design choice)', () => {
        // Block the start position
        tilemap = new MockTilemap(10, 10, [[0, 0]]);
        pathfinder = new Pathfinder(tilemap);

        const path = pathfinder.findPath(0, 0, 5, 5);

        // The implementation intentionally allows starting from obstacle tiles
        // This is useful when characters end up on unwalkable positions and need
        // to path out. The path should still reach the destination.
        expect(path).not.toBeNull();
        expect(path[path.length - 1].x).toBe(5);
        expect(path[path.length - 1].y).toBe(5);
    });

    // === Edge Cases ===

    it('should handle adjacent tiles', () => {
        const path = pathfinder.findPath(5, 5, 6, 5);

        expect(path).not.toBeNull();
        // Path: start -> end (2 tiles)
        expect(path.length).toBe(2);
        expect(path[1].x).toBe(6);
        expect(path[1].y).toBe(5);
    });

    it('should use 4-directional movement (no diagonal shortcuts)', () => {
        // Path from (0,0) to (1,1) should take 2 steps (not diagonal)
        const path = pathfinder.findPath(0, 0, 1, 1);

        expect(path).not.toBeNull();
        // Should be 3 tiles: (0,0) -> intermediate -> (1,1)
        expect(path.length).toBe(3);
    });

    // === Path Efficiency ===

    it('should find optimal length horizontal paths', () => {
        // Path from (0,0) to (5,0) should be 6 tiles (including start)
        const path = pathfinder.findPath(0, 0, 5, 0);

        expect(path).not.toBeNull();
        expect(path.length).toBe(6); // 0,1,2,3,4,5
    });

    it('should find efficient Manhattan paths', () => {
        // Path from (0,0) to (2,2) with Manhattan distance 4
        // Path should be 5 tiles (start + 4 moves)
        const path = pathfinder.findPath(0, 0, 2, 2);

        expect(path).not.toBeNull();
        expect(path.length).toBe(5);
    });

    // === Large Grid Performance ===

    it('should handle pathfinding on larger grids', () => {
        tilemap = new MockTilemap(50, 50);
        pathfinder = new Pathfinder(tilemap);

        const path = pathfinder.findPath(0, 0, 49, 49);

        expect(path).not.toBeNull();
        expect(path[path.length - 1].x).toBe(49);
        expect(path[path.length - 1].y).toBe(49);
    });

    it('should respect max iterations to prevent infinite loops', () => {
        // Create a maze-like obstacle pattern that's hard to solve
        const obstacles = [];
        for (let x = 0; x < 50; x += 2) {
            for (let y = 0; y < 50; y++) {
                if (y % 10 !== 0) obstacles.push([x, y]);
            }
        }

        tilemap = new MockTilemap(50, 50, obstacles);
        pathfinder = new Pathfinder(tilemap);

        // This may or may not find a path, but shouldn't hang
        const startTime = performance.now();
        const path = pathfinder.findPath(0, 0, 49, 49);
        const duration = performance.now() - startTime;

        // Should complete in reasonable time (under 1 second)
        expect(duration).toBeLessThan(1000);
    });

    // === Boundary Handling ===

    it('should not path outside map bounds', () => {
        tilemap = new MockTilemap(5, 5);
        pathfinder = new Pathfinder(tilemap);

        // Try to path to outside bounds
        const path = pathfinder.findPath(0, 0, 10, 10);

        expect(path).toBeNull();
    });

    // === Utility Methods ===

    it('should correctly identify adjacent tiles', () => {
        expect(pathfinder.isAdjacent(5, 5, 6, 5)).toBe(true);  // Right
        expect(pathfinder.isAdjacent(5, 5, 4, 5)).toBe(true);  // Left
        expect(pathfinder.isAdjacent(5, 5, 5, 6)).toBe(true);  // Down
        expect(pathfinder.isAdjacent(5, 5, 5, 4)).toBe(true);  // Up
        expect(pathfinder.isAdjacent(5, 5, 6, 6)).toBe(true);  // Diagonal
        expect(pathfinder.isAdjacent(5, 5, 5, 5)).toBe(false); // Same tile
        expect(pathfinder.isAdjacent(5, 5, 7, 5)).toBe(false); // Too far
    });

    it('should calculate correct Manhattan heuristic', () => {
        // Heuristic is scaled by MIN_TILE_COST (1/1.5 = 0.6667) to stay admissible with path tiles
        const MIN_TILE_COST = 1 / 1.5;
        expect(pathfinder.heuristic(0, 0, 5, 0)).toBeCloseTo(5 * MIN_TILE_COST, 5);
        expect(pathfinder.heuristic(0, 0, 0, 5)).toBeCloseTo(5 * MIN_TILE_COST, 5);
        expect(pathfinder.heuristic(0, 0, 3, 4)).toBeCloseTo(7 * MIN_TILE_COST, 5);
        expect(pathfinder.heuristic(5, 5, 5, 5)).toBe(0);
    });
});

describe('Pathfinder with Forest Generator', () => {
    let pathfinder;
    let tilemap;
    let mockForest;

    beforeEach(() => {
        // Small tilemap - forest extends beyond it
        tilemap = new MockTilemap(10, 10);

        // Mock forest generator
        mockForest = {
            // Used for out-of-tilemap (forest chunk) tiles
            isWalkable: (x, y) => {
                // Forest is walkable for x >= 10 (extends tilemap)
                // except for tree at (12, 5)
                if (x < 10) return true; // In tilemap, defer to tilemap
                if (x === 12 && y === 5) return false; // Tree
                return x < 20 && y >= 0 && y < 10;
            },
            // Used for in-tilemap tiles to detect forest tree trunks on grass
            isForestTreeTrunk: (_x, _y) => false,
            // Used for in-tilemap tiles to detect pocket ore obstacles
            isPocketOreObstacle: (_x, _y) => false
        };

        pathfinder = new Pathfinder(tilemap);
        pathfinder.setForestGenerator(mockForest);
    });

    it('should path into forest area', () => {
        // Path from inside tilemap to forest
        const path = pathfinder.findPath(8, 5, 15, 5);

        expect(path).not.toBeNull();
        expect(path[path.length - 1].x).toBe(15);
        expect(path[path.length - 1].y).toBe(5);
    });

    it('should avoid trees in forest', () => {
        // Path that must avoid tree at (12, 5)
        const path = pathfinder.findPath(10, 5, 14, 5);

        expect(path).not.toBeNull();
        // Should not pass through tree
        const containsTree = path.some(p => p.x === 12 && p.y === 5);
        expect(containsTree).toBe(false);
        expect(path[path.length - 1].x).toBe(14);
    });

    it('should handle setting forest generator', () => {
        const newPathfinder = new Pathfinder(tilemap);
        expect(newPathfinder.forestGenerator).toBeNull();

        newPathfinder.setForestGenerator(mockForest);
        expect(newPathfinder.forestGenerator).not.toBeNull();
    });
});

describe('OBSTACLE_TILES', () => {
    it('should export obstacle tile set', () => {
        expect(OBSTACLE_TILES).toBeDefined();
        expect(OBSTACLE_TILES instanceof Set).toBe(true);
    });

    it('should contain water tiles', () => {
        // Check some known water tiles
        expect(OBSTACLE_TILES.has(384)).toBe(true);
        expect(OBSTACLE_TILES.has(448)).toBe(true);
    });

    it('should not contain walkable tile IDs', () => {
        // Tile ID 1 (grass) should not be an obstacle
        expect(OBSTACLE_TILES.has(1)).toBe(false);
        // Tile ID 67 (hoed ground) should not be an obstacle
        expect(OBSTACLE_TILES.has(67)).toBe(false);
    });
});
