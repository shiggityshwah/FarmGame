import { Logger } from './Logger.js';

const log = Logger.create('ChunkGeneratorRegistry');

/**
 * ChunkGeneratorRegistry — maps biome type strings to ChunkContentGenerator instances
 * and resolves which biome type a newly-revealed chunk should be.
 *
 * Biome resolution priority:
 *   1. Designer-placed map  — explicit `"col,row" → type` overrides (always wins)
 *   2. Weighted random      — deterministic hash of (col, row) so the same world
 *                             position always produces the same biome across sessions
 *
 * Usage:
 *   const registry = new ChunkGeneratorRegistry();
 *   registry.register(new ForestChunkGenerator(forestGen));
 *   registry.setBiomeWeights([{ type: 'forest', weight: 8 }, { type: 'meadow', weight: 2 }]);
 *   registry.setDesignerMap({ '5,3': 'lake', '-2,1': 'desert' });
 *
 *   // Later when adding a new biome:
 *   registry.register(new LakeChunkGenerator());
 */
export class ChunkGeneratorRegistry {
    constructor() {
        /** @type {Map<string, import('./ChunkContentGenerator.js').ChunkContentGenerator>} */
        this.generators = new Map();

        /**
         * Designer-placed overrides: key = "col,row", value = biome type string.
         * Populated via setDesignerMap().  Takes priority over weighted random.
         * @type {Map<string, string>}
         */
        this.designerMap = new Map();

        /**
         * Weighted biome distribution used when no designer entry exists.
         * Array of { type: string, weight: number }.  Weights are relative (don't need to sum to 1).
         * @type {Array<{type: string, weight: number}>}
         */
        this.biomeWeights = [{ type: 'forest', weight: 1 }];
    }

    // ─── Registration ────────────────────────────────────────────────────────────

    /**
     * Register a generator.  The generator's `type` property is used as the key.
     * Re-registering the same type replaces the previous generator.
     * @param {import('./ChunkContentGenerator.js').ChunkContentGenerator} generator
     */
    register(generator) {
        this.generators.set(generator.type, generator);
        log.debug(`Registered generator for biome '${generator.type}'`);
    }

    /**
     * Return the generator for the given biome type.
     * Falls back to the 'forest' generator if `type` is unknown, or returns null
     * if neither exists.
     * @param {string} type
     * @returns {import('./ChunkContentGenerator.js').ChunkContentGenerator|null}
     */
    getGenerator(type) {
        return this.generators.get(type) ?? this.generators.get('forest') ?? null;
    }

    // ─── Biome Resolution ────────────────────────────────────────────────────────

    /**
     * Set (or replace) the designer-placed biome map.
     * @param {Object.<string, string>} map  Plain object: { "col,row": "biomeType", ... }
     */
    setDesignerMap(map) {
        this.designerMap.clear();
        for (const [key, type] of Object.entries(map)) {
            this.designerMap.set(key, type);
        }
        log.info(`Designer map updated: ${this.designerMap.size} entries`);
    }

    /**
     * Set the weighted biome distribution for procedural chunk type resolution.
     * @param {Array<{type: string, weight: number}>} weights
     */
    setBiomeWeights(weights) {
        this.biomeWeights = weights;
        log.info(`Biome weights updated: ${weights.map(w => `${w.type}×${w.weight}`).join(', ')}`);
    }

    /**
     * Resolve the biome type for a chunk at (col, row).
     *
     * Priority:
     *   1. Designer map entry for this exact position.
     *   2. Deterministic weighted random based on a hash of (col, row) — consistent
     *      across sessions; the same (col, row) always resolves to the same biome.
     *
     * @param {number} col
     * @param {number} row
     * @returns {string} Biome type string (e.g. 'forest', 'lake', 'meadow')
     */
    resolveType(col, row) {
        // 1. Designer override
        const key = `${col},${row}`;
        if (this.designerMap.has(key)) {
            const type = this.designerMap.get(key);
            log.debug(`resolveType(${col},${row}) → '${type}' (designer-placed)`);
            return type;
        }

        // 2. Deterministic weighted random
        // Uses two large primes to hash (col, row) into a stable 32-bit value.
        // Math.imul gives correct 32-bit integer multiplication on all platforms.
        const h = (Math.imul(col, 2654435761) ^ Math.imul(row, 2246822519)) >>> 0;
        const rand = (h % 10000) / 10000; // 0.0 – 0.9999

        const total = this.biomeWeights.reduce((s, b) => s + b.weight, 0);
        let cumulative = 0;
        for (const { type, weight } of this.biomeWeights) {
            cumulative += weight / total;
            if (rand < cumulative) {
                log.debug(`resolveType(${col},${row}) → '${type}' (weighted random, h=${h}, rand=${rand.toFixed(4)})`);
                return type;
            }
        }

        // Fallback (only reached due to floating-point rounding at the tail end)
        const fallback = this.biomeWeights[this.biomeWeights.length - 1]?.type ?? 'forest';
        log.debug(`resolveType(${col},${row}) → '${fallback}' (fallback)`);
        return fallback;
    }
}
