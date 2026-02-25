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
        this.forestGenerator.generateForChunk(
            bounds.x, bounds.y, bounds.width, bounds.height,
            options
        );
        log.debug(`Generated forest content for chunk (${col},${row})`);
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
        if (direction === 'S' && neighborGen?.type === 'forest') {
            this.forestGenerator.generateNSSeamTrees(
                bounds.x, bounds.y, bounds.width, bounds.height
            );
        } else if (direction === 'E' && neighborGen?.type === 'forest') {
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
