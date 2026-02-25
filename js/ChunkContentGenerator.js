/**
 * ChunkContentGenerator — base class / interface for per-biome chunk generators.
 *
 * To add a new biome (e.g. lake, desert, meadow):
 *   1. Create a class that extends ChunkContentGenerator.
 *   2. Override `get type()` to return your biome name string.
 *   3. Implement `generateGround()`, `generateContent()`, `generateSeam()`, and optionally
 *      `generateNorthEdge()`.
 *   4. Register an instance with `ChunkGeneratorRegistry.register(new YourGenerator(...))`.
 *
 * All methods are safe no-ops in the base class, so subclasses can override only what they need.
 */
export class ChunkContentGenerator {
    /**
     * Unique biome identifier.  Must match the string stored on chunk.type.
     * @returns {string}
     */
    get type() { return 'unknown'; }

    /**
     * Fill `chunkData` (a Uint16Array of length chunkSize²) with ground tile IDs
     * appropriate for this biome.  Called once when a chunk's tile storage is first
     * allocated (before any content is placed on top).
     *
     * @param {number} col        - Chunk grid column (can be negative).
     * @param {number} row        - Chunk grid row (can be negative).
     * @param {Uint16Array} chunkData - Pre-allocated array to fill in-place.
     * @param {number} chunkSize  - Tiles per side (always 30).
     */
    generateGround(col, row, chunkData, chunkSize) {
        chunkData.fill(65); // tile 65 = plain grass (safe fallback)
    }

    /**
     * Place entities, resources, or decorations inside the chunk.
     * Called when the chunk is first revealed (either the purchased chunk itself,
     * or a newly-allocated 8-way neighbor).
     *
     * @param {number} col
     * @param {number} row
     * @param {{x:number, y:number, width:number, height:number}} bounds - World tile coords.
     * @param {{pathExcludeYMin?:number|null, pathExcludeYMax?:number|null}} options
     */
    generateContent(col, row, bounds, options = {}) {}

    /**
     * Generate a transition seam between this chunk and an adjacent neighbor.
     * Called after both this chunk and its neighbor have had content placed.
     * Only needs to handle outward directions (e.g. 'S' places seam trees whose
     * trunks are in this chunk and crowns spill into the southern neighbor).
     *
     * @param {'N'|'S'|'E'|'W'} direction  - Which edge of THIS chunk borders the neighbor.
     * @param {{x:number, y:number, width:number, height:number}} bounds - THIS chunk's world bounds.
     * @param {ChunkContentGenerator|null} neighborGen - Generator of the neighboring chunk (may be null).
     */
    generateSeam(direction, bounds, neighborGen) {}

    /**
     * Place trees (or other decorations) whose trunks are at the top row of this chunk
     * so that crowns spill into the tile row above the chunk boundary.
     * Called for chunks that have no directly adjacent content chunk above them
     * (e.g. top row of the world, or chunks directly south of the great path strip).
     *
     * @param {{x:number, y:number, width:number, height:number}} bounds
     */
    generateNorthEdge(bounds) {}
}
