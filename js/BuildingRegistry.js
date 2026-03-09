/**
 * BuildingRegistry — Static configuration for all buildable structures.
 *
 * Each entry defines:
 *   id              Unique string key
 *   name            Display name shown in build submenu
 *   category        'house' | 'special'
 *   tilemapPrefix   Path prefix for CSV layer files (e.g. 'Tileset/shed1')
 *   footprint       { width, height } in tiles
 *   layers          Array of { csvSuffix, renderPass } defining layer files and render order
 *                   renderPass: 'ground' (below characters) | 'upper' (above) | 'roof' (above, hideable)
 *   cost            { wood, stone, gold, ore_iron, ore_coal, ... } resource amounts
 *   constructionCycles  Number of HAMMERING animation cycles to complete
 *   doorOffset      { x, y } local tile offset of front door from building top-left
 *   unlockedBy      villager id string that unlocks this (null for houses)
 *   unique          true for special buildings (only one can exist at a time)
 *   hasTilemap      true if CSV files exist and building can be placed
 *   debugOnly       true if only shown in debug/test placement UI
 *   deliveryCombo   Optional [{ id, count }] for future Phase 4b crate delivery display
 */

import { RESOURCE_TYPES } from './Inventory.js';

export const BUILDING_DEFS = {
    // ── Houses (player-buildable) ─────────────────────────────────────────────
    small_house: {
        id: 'small_house',
        name: 'Small House',
        category: 'house',
        tilemapPrefix: 'Tileset/house1',
        footprint: { width: 5, height: 5 },
        layers: [
            { csvSuffix: '_Ground.csv',        renderPass: 'ground' },
            { csvSuffix: '_Ground detail.csv', renderPass: 'ground' },
            { csvSuffix: '_Tile Layer 1.csv',  renderPass: 'upper'  },
            { csvSuffix: '_Tile Layer 2.csv',  renderPass: 'roof'   },
        ],
        cost: { wood: 20, stone: 10, gold: 50 },
        constructionCycles: 8,
        doorOffset: { x: 2, y: 3 },
        unlockedBy: null,
        unique: false,
        hasTilemap: true,
        debugOnly: false,
    },

    // ── Debug-only test building ──────────────────────────────────────────────
    debug_home: {
        id: 'debug_home',
        name: 'Debug Special (5×7)',
        category: 'house',
        tilemapPrefix: 'Tileset/special-test',
        footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 0, stone: 0, gold: 0 },
        constructionCycles: 1,
        doorOffset: { x: 3, y: 5 },
        unlockedBy: null,
        unique: false,
        hasTilemap: true,
        debugOnly: true,
    },

    // ── Special buildings (unlocked by villagers; use special-test.tmx tileset) ──
    // All special buildings share the special-test.tmx layout: 5×7 footprint,
    // same layer names, door at local offset (3, 5).
    pub: {
        id: 'pub', name: 'Pub / Inn', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 30, stone: 15, gold: 100 },
        constructionCycles: 10, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'innkeeper', unique: true, hasTilemap: true, debugOnly: false,
    },
    workshop: {
        id: 'workshop', name: 'Workshop', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 40, stone: 20, gold: 150, ore_iron: 5 },
        constructionCycles: 12, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'carpenter', unique: true, hasTilemap: true, debugOnly: false,
    },
    apothecary: {
        id: 'apothecary', name: 'Apothecary', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 25, stone: 10, gold: 200 },
        constructionCycles: 10, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'witch', unique: true, hasTilemap: true, debugOnly: false,
    },
    cafe: {
        id: 'cafe', name: 'Café', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 30, stone: 15, gold: 300 },
        constructionCycles: 10, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'barista', unique: true, hasTilemap: true, debugOnly: false,
    },
    shrine_temple: {
        id: 'shrine_temple', name: 'Shrine Temple', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { stone: 20, ore_gold: 10, ore_mithril: 5, gold: 500 },
        constructionCycles: 14, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'monk', unique: true, hasTilemap: true, debugOnly: false,
    },
    forge: {
        id: 'forge', name: 'Forge', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 20, stone: 30, ore_iron: 15, ore_coal: 10, gold: 400 },
        constructionCycles: 14, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'blacksmith', unique: true, hasTilemap: true, debugOnly: false,
    },
    trading_post: {
        id: 'trading_post', name: 'Trading Post', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 50, stone: 25, gold: 500 },
        constructionCycles: 14, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'merchant', unique: true, hasTilemap: true, debugOnly: false,
    },
    bakery: {
        id: 'bakery', name: 'Bakery', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 35, stone: 15, gold: 200 },
        constructionCycles: 10, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'baker', unique: true, hasTilemap: true, debugOnly: false,
    },
    dock: {
        id: 'dock', name: 'Dock / Fish Market', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 40, stone: 10, gold: 300 },
        constructionCycles: 12, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'fisherman', unique: true, hasTilemap: true, debugOnly: false,
    },
    goblin_den: {
        id: 'goblin_den', name: 'Goblin Den', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 25, stone: 20, gold: 350 },
        constructionCycles: 10, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'goblin_elder', unique: true, hasTilemap: true, debugOnly: false,
    },
    theater: {
        id: 'theater', name: 'Theater', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 45, stone: 20, gold: 400 },
        constructionCycles: 14, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'bard', unique: true, hasTilemap: true, debugOnly: false,
    },
    laboratory: {
        id: 'laboratory', name: 'Laboratory', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 30, stone: 20, ore_mithril: 10, gold: 800 },
        constructionCycles: 14, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'alchemist', unique: true, hasTilemap: true, debugOnly: false,
    },
    stable: {
        id: 'stable', name: 'Stable / Ranch', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 60, stone: 30, gold: 500 },
        constructionCycles: 16, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'rancher', unique: true, hasTilemap: true, debugOnly: false,
    },
    jewelry_shop: {
        id: 'jewelry_shop', name: 'Jewelry Shop', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 25, stone: 30, ore_gold: 15, gold: 1000 },
        constructionCycles: 12, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'jeweler', unique: true, hasTilemap: true, debugOnly: false,
    },
    town_hall: {
        id: 'town_hall', name: 'Town Hall', category: 'special',
        tilemapPrefix: 'Tileset/special-test', footprint: { width: 5, height: 7 },
        layers: [
            { csvSuffix: '_Decor.csv',                renderPass: 'ground' },
            { csvSuffix: '_Buildings (Base).csv',     renderPass: 'ground' },
            { csvSuffix: '_Buildings (Detail).csv',   renderPass: 'upper'  },
            { csvSuffix: '_Buildings (Upper).csv',    renderPass: 'upper'  },
        ],
        cost: { wood: 80, stone: 50, ore_iron: 20, gold: 2000 },
        constructionCycles: 20, doorOffset: { x: 3, y: 5 },
        unlockedBy: 'mayor', unique: true, hasTilemap: true, debugOnly: false,
    },
};

/**
 * Villager milestone definitions.
 * Each milestone:
 *   id          Unique villager type string
 *   name        Display name
 *   trigger     Function (milestones) => boolean — when the milestone becomes eligible
 *   combo       Array of { id: RESOURCE_TYPES key, count: N } — items required AT THE STAND
 *               Combo is 3–4 total items, completable in one stand transaction.
 */
export const VILLAGER_MILESTONES = [
    {
        id: 'innkeeper', name: 'Innkeeper',
        trigger: m => m.totalGoldEarned >= 500,
        combo: [
            { id: 'CROP_RADISH', count: 2 },
            { id: 'CROP_PARSNIP', count: 1 },
            { id: 'CROP_CARROT', count: 1 },
        ],
    },
    {
        id: 'carpenter', name: 'Carpenter',
        trigger: m => m.totalChunksOwned >= 2,
        combo: [
            { id: 'WOOD', count: 2 },
            { id: 'ORE_STONE', count: 1 },
            { id: 'ORE_IRON', count: 1 },
        ],
    },
    {
        id: 'witch', name: 'Witch',
        trigger: m => m.totalPotionsCrafted >= 3,
        combo: [
            { id: 'FLOWER_RED', count: 1 },
            { id: 'FLOWER_BLUE', count: 1 },
            { id: 'CROP_POTATO', count: 1 },
        ],
    },
    {
        id: 'barista', name: 'Barista',
        trigger: m => m.totalCropsPlanted >= 50,
        combo: [
            { id: 'CROP_WHEAT', count: 2 },
            { id: 'FLOWER_WHITE', count: 1 },
            { id: 'CROP_CAULIFLOWER', count: 1 },
        ],
    },
    {
        id: 'monk', name: 'Monk',
        trigger: m => m.totalShrineUpgrades >= 1,
        combo: [
            { id: 'ORE_GOLD', count: 1 },
            { id: 'ORE_MITHRIL', count: 1 },
            { id: 'CROP_STARFRUIT', count: 1 },
        ],
    },
    {
        id: 'blacksmith', name: 'Blacksmith',
        trigger: m => m.totalAnvilUpgrades >= 2,
        combo: [
            { id: 'ORE_IRON', count: 2 },
            { id: 'ORE_COAL', count: 1 },
            { id: 'WOOD', count: 1 },
        ],
    },
    {
        id: 'merchant', name: 'Merchant',
        trigger: m => m.totalChunksOwned >= 5,
        combo: [
            { id: 'CROP_CARROT', count: 1 },
            { id: 'CROP_CORN', count: 1 },
            { id: 'CROP_PUMPKIN', count: 1 },
            { id: 'CROP_PARSNIP', count: 1 },
        ],
    },
    {
        id: 'baker', name: 'Baker',
        trigger: m => m.totalCropsHarvested >= 100,
        combo: [
            { id: 'CROP_WHEAT', count: 2 },
            { id: 'CROP_CORN', count: 1 },
            { id: 'CROP_POTATO', count: 1 },
        ],
    },
    {
        id: 'fisherman', name: 'Fisherman',
        trigger: m => m.totalGoldEarned >= 5000,
        combo: [
            { id: 'WOOD', count: 2 },
            { id: 'CROP_PARSNIP', count: 1 },
            { id: 'ORE_COAL', count: 1 },
        ],
    },
    {
        id: 'goblin_elder', name: 'Goblin Elder',
        trigger: m => m.goblinEverHired && m.totalChunksOwned >= 4,
        combo: [
            { id: 'CROP_PUMPKIN', count: 2 },
            { id: 'ORE_GOLD', count: 1 },
            { id: 'MINOR_HEALTH_POTION', count: 1 },
        ],
    },
    {
        id: 'bard', name: 'Bard',
        trigger: m => m.totalVillagersRecruited >= 5,
        combo: [
            { id: 'FLOWER_RED', count: 1 },
            { id: 'FLOWER_BLUE', count: 1 },
            { id: 'FLOWER_WHITE', count: 1 },
            { id: 'CROP_MELON', count: 1 },
        ],
    },
    {
        id: 'alchemist', name: 'Alchemist',
        trigger: m => m.totalShrineUpgrades >= 4,
        combo: [
            { id: 'CROP_STARFRUIT', count: 2 },
            { id: 'ORE_MITHRIL', count: 1 },
            { id: 'GROWTH_ELIXIR', count: 1 },
        ],
    },
    {
        id: 'rancher', name: 'Rancher',
        trigger: m => m.totalChunksOwned >= 8,
        combo: [
            { id: 'CROP_WHEAT', count: 2 },
            { id: 'CROP_CORN', count: 1 },
            { id: 'CROP_CARROT', count: 1 },
        ],
    },
    {
        id: 'jeweler', name: 'Jeweler',
        trigger: m => m.totalGoldEarned >= 50000,
        combo: [
            { id: 'ORE_GOLD', count: 1 },
            { id: 'ORE_MITHRIL', count: 1 },
            { id: 'FLOWER_BLUE', count: 1 },
        ],
    },
    {
        id: 'mayor', name: 'Mayor',
        trigger: m => m.totalVillagersRecruited >= 10,
        combo: [
            { id: 'CROP_CARROT', count: 1 },
            { id: 'CROP_CORN', count: 1 },
            { id: 'CROP_PUMPKIN', count: 1 },
            { id: 'CROP_PARSNIP', count: 1 },
        ],
    },
];

/**
 * Convert a building cost object to refund items array for JobManager.
 * { wood: 20, stone: 10, gold: 50 } → [{ resource, amount }, ...]
 */
export function buildingCostToRefundItems(cost) {
    const costKeyToResourceId = {
        wood:        'WOOD',
        stone:       'ORE_STONE',
        gold:        'GOLD',
        ore_iron:    'ORE_IRON',
        ore_coal:    'ORE_COAL',
        ore_mithril: 'ORE_MITHRIL',
        ore_gold:    'ORE_GOLD',
    };
    return Object.entries(cost)
        .filter(([, amount]) => amount > 0)
        .map(([key, amount]) => {
            const rtKey = costKeyToResourceId[key];
            return rtKey ? { resource: RESOURCE_TYPES[rtKey], amount } : null;
        })
        .filter(Boolean);
}
