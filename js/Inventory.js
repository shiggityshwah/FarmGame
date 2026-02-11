// Inventory system to track collected resources
// Resources are stored by type and include display information

import { Logger } from './Logger.js';

const log = Logger.create('Inventory');

export const RESOURCE_TYPES = {
    // Crops (harvested from fully grown plants)
    CROP_CARROT: { id: 'crop_carrot', name: 'Carrot', category: 'crop', tileId: 691, sell_price: 18 },
    CROP_CAULIFLOWER: { id: 'crop_cauliflower', name: 'Cauliflower', category: 'crop', tileId: 692, sell_price: 170 },
    CROP_PUMPKIN: { id: 'crop_pumpkin', name: 'Pumpkin', category: 'crop', tileId: 693, sell_price: 430 },
    CROP_SUNFLOWER: { id: 'crop_sunflower', name: 'Sunflower', category: 'crop', tileId: 694, sell_price: 200 },
    CROP_RADISH: { id: 'crop_radish', name: 'Radish', category: 'crop', tileId: 695, sell_price: 22 },
    CROP_PARSNIP: { id: 'crop_parsnip', name: 'Parsnip', category: 'crop', tileId: 696, sell_price: 28 },
    CROP_POTATO: { id: 'crop_potato', name: 'Potato', category: 'crop', tileId: 697, sell_price: 65 },
    CROP_CABBAGE: { id: 'crop_cabbage', name: 'Cabbage', category: 'crop', tileId: 698, sell_price: 90 },
    CROP_BEETROOT: { id: 'crop_beetroot', name: 'Beetroot', category: 'crop', tileId: 699, sell_price: 75 },
    CROP_WHEAT: { id: 'crop_wheat', name: 'Wheat', category: 'crop', tileId: 700, sell_price: 210 },
    CROP_WEED: { id: 'crop_weed', name: 'Weed', category: 'crop', tileId: 701 },

    // Seeds (purchased from shop, used to plant crops)
    SEED_CARROT: { id: 'seed_carrot', name: 'Carrot Seeds', category: 'seed', tileId: 755, cropIndex: 0, price: 10 },
    SEED_CAULIFLOWER: { id: 'seed_cauliflower', name: 'Cauliflower Seeds', category: 'seed', tileId: 756, cropIndex: 1, price: 70 },
    SEED_PUMPKIN: { id: 'seed_pumpkin', name: 'Pumpkin Seeds', category: 'seed', tileId: 757, cropIndex: 2, price: 150 },
    SEED_SUNFLOWER: { id: 'seed_sunflower', name: 'Sunflower Seeds', category: 'seed', tileId: 758, cropIndex: 3, price: 80 },
    SEED_RADISH: { id: 'seed_radish', name: 'Radish Seeds', category: 'seed', tileId: 759, cropIndex: 4, price: 12 },
    SEED_PARSNIP: { id: 'seed_parsnip', name: 'Parsnip Seeds', category: 'seed', tileId: 760, cropIndex: 5, price: 15 },
    SEED_POTATO: { id: 'seed_potato', name: 'Potato Seeds', category: 'seed', tileId: 761, cropIndex: 6, price: 30 },
    SEED_CABBAGE: { id: 'seed_cabbage', name: 'Cabbage Seeds', category: 'seed', tileId: 762, cropIndex: 7, price: 40 },
    SEED_BEETROOT: { id: 'seed_beetroot', name: 'Beetroot Seeds', category: 'seed', tileId: 763, cropIndex: 8, price: 35 },
    SEED_WHEAT: { id: 'seed_wheat', name: 'Wheat Seeds', category: 'seed', tileId: 764, cropIndex: 9, price: 90 },

    // Flowers (harvested from wild flowers)
    FLOWER: { id: 'flower', name: 'Flower', category: 'flower', tileId: 227, sell_price: 2 },

    // Ores (mined from ore veins)
    ORE_IRON: { id: 'ore_iron', name: 'Iron Ore', category: 'ore', tileId: 1463 },
    ORE_COAL: { id: 'ore_coal', name: 'Coal', category: 'ore', tileId: 1591 },
    ORE_MITHRIL: { id: 'ore_mithril', name: 'Mithril Ore', category: 'ore', tileId: 1719 },
    ORE_GOLD: { id: 'ore_gold', name: 'Gold Ore', category: 'ore', tileId: 1847 },
    ORE_STONE: { id: 'ore_stone', name: 'Stone', category: 'ore', tileId: 1975 },

    // Wood (chopped from trees)
    WOOD: { id: 'wood', name: 'Wood', category: 'wood', tileId: 753 },

    // Currency (gold coins)
    GOLD: { id: 'gold', name: 'Gold Coin', category: 'currency', tileId: 1961 }
};

// Map tile IDs to resource types for easy lookup
const TILE_TO_RESOURCE = {};
for (const key of Object.keys(RESOURCE_TYPES)) {
    const resource = RESOURCE_TYPES[key];
    TILE_TO_RESOURCE[resource.tileId] = resource;
}

// Map crop type index to resource type
const CROP_INDEX_TO_RESOURCE = {
    0: RESOURCE_TYPES.CROP_CARROT,
    1: RESOURCE_TYPES.CROP_CAULIFLOWER,
    2: RESOURCE_TYPES.CROP_PUMPKIN,
    3: RESOURCE_TYPES.CROP_SUNFLOWER,
    4: RESOURCE_TYPES.CROP_RADISH,
    5: RESOURCE_TYPES.CROP_PARSNIP,
    6: RESOURCE_TYPES.CROP_POTATO,
    7: RESOURCE_TYPES.CROP_CABBAGE,
    8: RESOURCE_TYPES.CROP_BEETROOT,
    9: RESOURCE_TYPES.CROP_WHEAT,
    10: RESOURCE_TYPES.CROP_WEED
};

// Map ore type name to resource type
const ORE_NAME_TO_RESOURCE = {
    'Iron': RESOURCE_TYPES.ORE_IRON,
    'Coal': RESOURCE_TYPES.ORE_COAL,
    'Mithril': RESOURCE_TYPES.ORE_MITHRIL,
    'Gold': RESOURCE_TYPES.ORE_GOLD,
    'Rock': RESOURCE_TYPES.ORE_STONE
};

export class Inventory {
    constructor() {
        // Store quantities by resource ID
        this.items = {};
        // Callback for when inventory changes
        this.onChangeCallback = null;

        // Initialize all resource types with 0
        for (const key of Object.keys(RESOURCE_TYPES)) {
            this.items[RESOURCE_TYPES[key].id] = 0;
        }
    }

    // Set callback for inventory changes
    onChange(callback) {
        this.onChangeCallback = callback;
    }

    // Notify listeners of change
    notifyChange() {
        if (this.onChangeCallback) {
            this.onChangeCallback();
        }
    }

    // Add a resource by its type
    add(resourceType, amount = 1) {
        if (!resourceType || !resourceType.id) {
            log.warn('Invalid resource type:', resourceType);
            return false;
        }
        this.items[resourceType.id] = (this.items[resourceType.id] || 0) + amount;
        log.debug(`Added ${amount} ${resourceType.name}. Total: ${this.items[resourceType.id]}`);
        this.notifyChange();
        return true;
    }

    // Remove a resource by its type
    remove(resourceType, amount = 1) {
        if (!resourceType || !resourceType.id) {
            return false;
        }
        const current = this.items[resourceType.id] || 0;
        if (current < amount) {
            return false;
        }
        this.items[resourceType.id] = current - amount;
        this.notifyChange();
        return true;
    }

    // Check if we have enough of a resource
    has(resourceType, amount = 1) {
        if (!resourceType || !resourceType.id) {
            return false;
        }
        return (this.items[resourceType.id] || 0) >= amount;
    }

    // Get count of a specific resource
    getCount(resourceType) {
        if (!resourceType || !resourceType.id) {
            return 0;
        }
        return this.items[resourceType.id] || 0;
    }

    // Get all items in a category (crop, ore, wood)
    getByCategory(category) {
        const result = [];
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            if (resource.category === category) {
                const count = this.items[resource.id] || 0;
                if (count > 0) {
                    result.push({ resource, count });
                }
            }
        }
        return result;
    }

    // Get all non-zero items
    getAllItems() {
        const result = [];
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            const count = this.items[resource.id] || 0;
            if (count > 0) {
                result.push({ resource, count });
            }
        }
        return result;
    }

    // Add crop by crop type index (from Crop.js)
    addCropByIndex(cropIndex, amount = 1) {
        const resourceType = CROP_INDEX_TO_RESOURCE[cropIndex];
        if (resourceType) {
            return this.add(resourceType, amount);
        }
        log.warn('Unknown crop index:', cropIndex);
        return false;
    }

    // Add ore by ore type name (from OreVein.js)
    addOreByName(oreName, amount = 1) {
        const resourceType = ORE_NAME_TO_RESOURCE[oreName];
        if (resourceType) {
            return this.add(resourceType, amount);
        }
        log.warn('Unknown ore name:', oreName);
        return false;
    }

    // Add wood
    addWood(amount = 1) {
        return this.add(RESOURCE_TYPES.WOOD, amount);
    }

    // Add gold
    addGold(amount = 1) {
        return this.add(RESOURCE_TYPES.GOLD, amount);
    }

    // Get current gold amount
    getGold() {
        return this.getCount(RESOURCE_TYPES.GOLD);
    }

    // Spend gold (returns false if not enough)
    spendGold(amount) {
        return this.remove(RESOURCE_TYPES.GOLD, amount);
    }

    // Get resource type by tile ID
    getResourceByTileId(tileId) {
        return TILE_TO_RESOURCE[tileId] || null;
    }

    // Get seed resource by crop index
    getSeedByCropIndex(cropIndex) {
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            if (resource.category === 'seed' && resource.cropIndex === cropIndex) {
                return resource;
            }
        }
        return null;
    }

    // Use a seed (remove from inventory)
    useSeed(seedResource) {
        if (!seedResource || seedResource.category !== 'seed') {
            return false;
        }
        return this.remove(seedResource, 1);
    }
}

// Export helpers
export function getResourceByCropIndex(index) {
    return CROP_INDEX_TO_RESOURCE[index] || null;
}

export function getResourceByOreName(name) {
    return ORE_NAME_TO_RESOURCE[name] || null;
}
