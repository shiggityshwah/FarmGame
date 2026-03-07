import { Logger } from './Logger.js';
import { ChunkContentGenerator } from './ChunkContentGenerator.js';
import { CONFIG } from './config.js';

const log = Logger.create('ForestChunkGenerator');

/**
 * ForestChunkGenerator — ChunkContentGenerator implementation for forest biome chunks.
 *
 * Wraps the existing ForestGenerator and delegates all generation to it,
 * so the existing tree/pocket/seam logic is reused without duplication.
 *
 * Register once during Game.init():
 *   registry.register(new ForestChunkGenerator(this.forestGenerator));
 */
export class ForestChunkGenerator extends ChunkContentGenerator {
    /**
     * @param {import('./ForestGenerator.js').ForestGenerator} forestGenerator
     */
    constructor(forestGenerator) {
        super();
        this.forestGenerator = forestGenerator;
    }

    get type() { return 'forest'; }

    /**
     * Fill chunkData with randomised grass tiles — matches ChunkManager's existing fallback
     * so visual appearance is identical whether the registry is wired or not.
     * @param {number} col
     * @param {number} row
     * @param {Uint16Array} chunkData
     * @param {number} chunkSize
     */
    generateGround(col, row, chunkData, chunkSize) {
        const grass = CONFIG.tiles.grass;
        for (let i = 0; i < chunkSize * chunkSize; i++) {
            chunkData[i] = grass[Math.floor(Math.random() * grass.length)];
        }
    }

    /**
     * Generate forest content (trees + resource pockets) within the chunk's world bounds.
     * `options` is forwarded directly to ForestGenerator.generateForChunk(), so
     * { pathExcludeYMin, pathExcludeYMax } work as expected.
     * @param {number} col
     * @param {number} row
     * @param {{x:number, y:number, width:number, height:number}} bounds
     * @param {{pathExcludeYMin?:number|null, pathExcludeYMax?:number|null}} options
     */
    generateContent(col, row, bounds, options = {}) {
        const dist = Math.abs(col - CONFIG.chunks.farmCol) + Math.abs(row - CONFIG.chunks.farmRow);
        this.forestGenerator.generateForChunk(
            bounds.x, bounds.y, bounds.width, bounds.height,
            { ...options, distance: dist }
        );
        log.debug(`Generated forest content for chunk (${col},${row}) dist=${dist}`);
    }

    /**
     * Generate seam trees at the S or E edge of this chunk when the neighbor is also forest.
     * Seam trees straddle the chunk boundary for seamless visual adjacency.
     * N and W seams are handled by the adjacent chunk's S/E call instead.
     * @param {'N'|'S'|'E'|'W'} direction
     * @param {{x:number, y:number, width:number, height:number}} bounds
     * @param {ChunkContentGenerator|null} neighborGen
     */
    generateSeam(direction, bounds, neighborGen) {
        const isForestNeighbor = neighborGen?.type === 'forest' || neighborGen?.type === 'dense_forest';
        if (direction === 'S' && isForestNeighbor) {
            this.forestGenerator.generateNSSeamTrees(
                bounds.x, bounds.y, bounds.width, bounds.height
            );
        } else if (direction === 'E' && isForestNeighbor) {
            this.forestGenerator.generateEWSeamTrees(
                bounds.x, bounds.y, bounds.width, bounds.height
            );
        }
    }

    /**
     * Place trees whose trunks sit at the chunk's top row so their crowns spill above.
     * Called for forest chunks that have no directly adjacent forest above them
     * (e.g. top-of-world row, or the first chunk row south of the great path strip).
     * @param {{x:number, y:number, width:number, height:number}} bounds
     */
    generateNorthEdge(bounds) {
        this.forestGenerator.generateNorthEdgeTrees(bounds.x, bounds.y, bounds.width);
    }
}

/**
 * DenseForestChunkGenerator — forest biome for north-of-great-path chunks.
 *
 * These chunks are permanently locked (town expansion uses a different mechanic).
 * They generate very dense tree coverage with no resource pockets or clearings.
 */
export class DenseForestChunkGenerator extends ForestChunkGenerator {
    get type() { return 'dense_forest'; }

    /**
     * Generate dense forest content: no pocket, very high density (0.9).
     */
    generateContent(col, row, bounds, options = {}) {
        this.forestGenerator.generateForChunk(
            bounds.x, bounds.y, bounds.width, bounds.height,
            { ...options, noPocket: true, density: 0.9 }
        );
        log.debug(`Generated dense forest content for chunk (${col},${row})`);
    }
}

/**
 * SparseForestChunkGenerator — lightly treed biome for former town chunks.
 *
 * Home (row 2) and store (row 1) chunks start as sparse forest that the player
 * clears to build their town. Low density and no resource pockets so the area
 * feels open and accessible from the start.
 */
export class SparseForestChunkGenerator extends ForestChunkGenerator {
    get type() { return 'sparse_forest'; }

    /**
     * Generate sparse forest content: no pocket, low density (0.3).
     */
    generateContent(col, row, bounds, options = {}) {
        this.forestGenerator.generateForChunk(
            bounds.x, bounds.y, bounds.width, bounds.height,
            { ...options, noPocket: true, density: 0.3 }
        );
        log.debug(`Generated sparse forest content for chunk (${col},${row})`);
    }
}
