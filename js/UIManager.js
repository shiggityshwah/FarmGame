// UI Manager handles all menu systems (Storage, Crafting, etc.)

import { RESOURCE_TYPES } from './Inventory.js';
import { Logger } from './Logger.js';

const log = Logger.create('UIManager');

// Crafting recipes - upgrades that can be purchased with resources
export const UPGRADES = {
    FASTER_HOE: {
        id: 'faster_hoe',
        name: 'Efficient Hoe',
        description: 'Hoe dirt 25% faster',
        cost: [
            { resource: RESOURCE_TYPES.WOOD, amount: 2 },
            { resource: RESOURCE_TYPES.ORE_STONE, amount: 2 }
        ],
        effect: { type: 'animation_speed', tool: 'hoe', multiplier: 0.75 },
        iconTileId: 2986
    },
    FASTER_AXE: {
        id: 'faster_axe',
        name: 'Sharp Axe',
        description: 'Chop trees 25% faster',
        cost: [
            { resource: RESOURCE_TYPES.WOOD, amount: 3 },
            { resource: RESOURCE_TYPES.ORE_IRON, amount: 2 }
        ],
        effect: { type: 'animation_speed', tool: 'axe', multiplier: 0.75 },
        iconTileId: 2922
    },
    FASTER_PICKAXE: {
        id: 'faster_pickaxe',
        name: 'Reinforced Pickaxe',
        description: 'Mine ore 25% faster',
        cost: [
            { resource: RESOURCE_TYPES.WOOD, amount: 2 },
            { resource: RESOURCE_TYPES.ORE_STONE, amount: 3 }
        ],
        effect: { type: 'animation_speed', tool: 'pickaxe', multiplier: 0.75 },
        iconTileId: 3113
    },
    MORE_HEALTH: {
        id: 'more_health',
        name: 'Vitality Boost',
        description: 'Increase max health by 25',
        cost: [
            { resource: RESOURCE_TYPES.CROP_CARROT, amount: 5 },
            { resource: RESOURCE_TYPES.CROP_BEETROOT, amount: 3 }
        ],
        effect: { type: 'max_health', amount: 25 },
        iconTileId: 691
    }
};

export class UIManager {
    constructor(game) {
        this.game = game;
        this.activeMenu = null;
        this.menuContainer = null;
        this.purchasedUpgrades = new Set();

        // Store bound event handlers for proper cleanup
        this._boundHandlers = {
            onKeyDown: this._handleKeyDown.bind(this),
            onContainerClick: this._handleContainerClick.bind(this),
            onInventoryChange: this._handleInventoryChange.bind(this)
        };

        this.createMenuContainer();
        this.subscribeToInventory();
    }

    // Internal handler for keydown events
    _handleKeyDown(e) {
        if (e.key === 'Escape' && this.activeMenu) {
            this.closeMenu();
        }
    }

    // Internal handler for container click events
    _handleContainerClick(e) {
        if (e.target === this.menuContainer) {
            this.closeMenu();
        }
    }

    // Internal handler for inventory changes
    _handleInventoryChange() {
        if (this.activeMenu === 'storage') {
            this.renderStorageMenu();
        } else if (this.activeMenu === 'crafting') {
            this.renderCraftingMenu();
        } else if (this.activeMenu === 'shop') {
            this.renderShopMenu(this.shopActiveTab || 'buy');
        }
    }

    subscribeToInventory() {
        // Re-render active menu when inventory changes
        this.game.inventory.onChange(this._boundHandlers.onInventoryChange);
    }

    createMenuContainer() {
        // Create the main menu container (hidden by default)
        this.menuContainer = document.createElement('div');
        this.menuContainer.id = 'game-menu-container';
        this.menuContainer.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 200;
            justify-content: center;
            align-items: center;
        `;

        // Create the menu panel
        this.menuPanel = document.createElement('div');
        this.menuPanel.id = 'game-menu-panel';
        this.menuPanel.style.cssText = `
            width: 400px;
            max-height: 80vh;
            background: linear-gradient(180deg, #f5e6c8 0%, #e8d4a8 100%);
            border: 4px solid #8b7355;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            overflow: hidden;
            font-family: Arial, sans-serif;
        `;

        this.menuContainer.appendChild(this.menuPanel);
        document.body.appendChild(this.menuContainer);

        // Close menu when clicking outside (use stored bound handler)
        this.menuContainer.addEventListener('click', this._boundHandlers.onContainerClick);

        // Close menu with Escape key (use stored bound handler)
        document.addEventListener('keydown', this._boundHandlers.onKeyDown);
    }

    // Clean up event listeners and DOM elements
    destroy() {
        // Remove document-level event listener
        document.removeEventListener('keydown', this._boundHandlers.onKeyDown);

        // Remove container event listener
        if (this.menuContainer) {
            this.menuContainer.removeEventListener('click', this._boundHandlers.onContainerClick);
            // Remove from DOM
            if (this.menuContainer.parentNode) {
                this.menuContainer.parentNode.removeChild(this.menuContainer);
            }
        }

        // Clear inventory callback
        if (this.game.inventory) {
            this.game.inventory.onChange(null);
        }

        // Clear references
        this.menuContainer = null;
        this.menuPanel = null;
        this._boundHandlers = null;
    }

    openStorage() {
        this.activeMenu = 'storage';
        this.renderStorageMenu();
        this.menuContainer.style.display = 'flex';
    }

    openCrafting() {
        this.activeMenu = 'crafting';
        this.renderCraftingMenu();
        this.menuContainer.style.display = 'flex';
    }

    openShop() {
        this.activeMenu = 'shop';
        this.renderShopMenu(this.shopActiveTab || 'buy');
        this.menuContainer.style.display = 'flex';
    }

    closeMenu() {
        this.activeMenu = null;
        this.menuContainer.style.display = 'none';
    }

    renderStorageMenu() {
        const inventory = this.game.inventory;
        const allItems = inventory.getAllItems();

        let html = `
            <div style="background: linear-gradient(180deg, #8b7355 0%, #6b5a45 100%); color: #f5e6c8; padding: 12px 16px; text-align: center; border-bottom: 3px solid #5a4a38;">
                <span style="font-size: 18px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Storage</span>
                <button id="close-menu-btn" style="float: right; background: #c9403a; border: 2px solid #8b2a25; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
            <div style="padding: 16px; max-height: 60vh; overflow-y: auto;">
        `;

        if (allItems.length === 0) {
            html += `<p style="text-align: center; color: #5a4a38; font-style: italic;">Your storage is empty. Harvest crops, chop trees, and mine ore to collect resources!</p>`;
        } else {
            // Group items by category
            const currency = inventory.getByCategory('currency');
            const seeds = inventory.getByCategory('seed');
            const crops = inventory.getByCategory('crop');
            const flowers = inventory.getByCategory('flower');
            const ores = inventory.getByCategory('ore');
            const wood = inventory.getByCategory('wood');

            if (currency.length > 0) {
                html += this.renderItemCategory('Currency', currency);
            }
            if (seeds.length > 0) {
                html += this.renderItemCategory('Seeds', seeds);
            }
            if (crops.length > 0) {
                html += this.renderItemCategory('Crops', crops);
            }
            if (flowers.length > 0) {
                html += this.renderItemCategory('Flowers', flowers);
            }
            if (ores.length > 0) {
                html += this.renderItemCategory('Ores', ores);
            }
            if (wood.length > 0) {
                html += this.renderItemCategory('Wood', wood);
            }
        }

        html += '</div>';
        this.menuPanel.innerHTML = html;

        // Add close button listener
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());
    }

    renderItemCategory(title, items) {
        let html = `<h3 style="color: #5a4a38; margin: 8px 0 8px 0; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #c4a882; padding-bottom: 4px;">${title}</h3>`;
        html += '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">';

        for (const item of items) {
            html += `
                <div style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #a89070; border-radius: 6px; padding: 8px; text-align: center;">
                    <div style="width: 32px; height: 32px; margin: 0 auto 4px auto; display: flex; align-items: center; justify-content: center;">
                        <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(item.resource.tileId)}; background-size: 1024px 1024px; transform: scale(2);"></div>
                    </div>
                    <div style="font-size: 10px; color: #5a4a38; margin-top: 8px;">${item.resource.name}</div>
                    <div style="font-size: 14px; font-weight: bold; color: #2d4d1f;">x${item.count}</div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    renderCraftingMenu() {
        const inventory = this.game.inventory;

        let html = `
            <div style="background: linear-gradient(180deg, #8b7355 0%, #6b5a45 100%); color: #f5e6c8; padding: 12px 16px; text-align: center; border-bottom: 3px solid #5a4a38;">
                <span style="font-size: 18px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Crafting - Upgrades</span>
                <button id="close-menu-btn" style="float: right; background: #c9403a; border: 2px solid #8b2a25; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
            <div style="padding: 16px; max-height: 60vh; overflow-y: auto;">
        `;

        for (const key of Object.keys(UPGRADES)) {
            const upgrade = UPGRADES[key];
            const isPurchased = this.purchasedUpgrades.has(upgrade.id);
            const canAfford = this.canAffordUpgrade(upgrade);

            html += this.renderUpgradeCard(upgrade, isPurchased, canAfford);
        }

        html += '</div>';
        this.menuPanel.innerHTML = html;

        // Add close button listener
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());

        // Add craft button listeners
        for (const key of Object.keys(UPGRADES)) {
            const upgrade = UPGRADES[key];
            const btn = document.getElementById(`craft-${upgrade.id}`);
            if (btn) {
                btn.addEventListener('click', () => this.purchaseUpgrade(upgrade));
            }
        }
    }

    renderUpgradeCard(upgrade, isPurchased, canAfford) {
        const statusColor = isPurchased ? '#2d4d1f' : (canAfford ? '#4a7ab0' : '#8b4a4a');
        const statusText = isPurchased ? 'OWNED' : (canAfford ? 'AVAILABLE' : 'NEED RESOURCES');

        let html = `
            <div style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid ${isPurchased ? '#2d4d1f' : '#a89070'}; border-radius: 8px; padding: 12px; margin-bottom: 12px; ${isPurchased ? 'opacity: 0.7;' : ''}">
                <div style="display: flex; align-items: flex-start;">
                    <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(upgrade.iconTileId)}; background-size: 1024px 1024px; transform: scale(3); transform-origin: top left; margin-right: 40px; margin-bottom: 32px; flex-shrink: 0;"></div>
                    <div style="flex: 1; margin-left: 16px;">
                        <div style="font-weight: bold; color: #5a4a38; font-size: 14px;">${upgrade.name}</div>
                        <div style="font-size: 11px; color: #7a6a5a; margin: 4px 0;">${upgrade.description}</div>
                        <div style="font-size: 10px; color: ${statusColor}; font-weight: bold;">${statusText}</div>
                    </div>
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #c4a882;">
                    <div style="font-size: 11px; color: #5a4a38; margin-bottom: 6px;">Cost:</div>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        `;

        for (const cost of upgrade.cost) {
            const hasEnough = this.game.inventory.has(cost.resource, cost.amount);
            html += `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(cost.resource.tileId)}; background-size: 1024px 1024px;"></div>
                    <span style="font-size: 11px; color: ${hasEnough ? '#2d4d1f' : '#c9403a'};">${cost.amount} ${cost.resource.name}</span>
                </div>
            `;
        }

        html += '</div>';

        if (!isPurchased) {
            html += `
                <button id="craft-${upgrade.id}" style="
                    margin-top: 8px;
                    padding: 6px 16px;
                    background: ${canAfford ? 'linear-gradient(180deg, #5a8f3e 0%, #3d6b2a 100%)' : 'linear-gradient(180deg, #888 0%, #666 100%)'};
                    border: 2px solid ${canAfford ? '#2d4d1f' : '#444'};
                    border-radius: 4px;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                    cursor: ${canAfford ? 'pointer' : 'not-allowed'};
                    ${canAfford ? '' : 'opacity: 0.6;'}
                ">Craft</button>
            `;
        }

        html += '</div></div>';
        return html;
    }

    canAffordUpgrade(upgrade) {
        for (const cost of upgrade.cost) {
            if (!this.game.inventory.has(cost.resource, cost.amount)) {
                return false;
            }
        }
        return true;
    }

    purchaseUpgrade(upgrade) {
        if (this.purchasedUpgrades.has(upgrade.id)) {
            log.debug('Upgrade already purchased:', upgrade.name);
            return;
        }

        if (!this.canAffordUpgrade(upgrade)) {
            log.debug('Cannot afford upgrade:', upgrade.name);
            return;
        }

        // Deduct resources
        for (const cost of upgrade.cost) {
            this.game.inventory.remove(cost.resource, cost.amount);
        }

        // Mark as purchased
        this.purchasedUpgrades.add(upgrade.id);

        // Apply the upgrade effect
        this.applyUpgradeEffect(upgrade);

        log.info('Purchased upgrade:', upgrade.name);

        // Re-render the menu
        this.renderCraftingMenu();
    }

    applyUpgradeEffect(upgrade) {
        const effect = upgrade.effect;

        switch (effect.type) {
            case 'animation_speed':
                // Store animation speed multipliers for tools
                if (!this.game.toolAnimationMultipliers) {
                    this.game.toolAnimationMultipliers = {};
                }
                this.game.toolAnimationMultipliers[effect.tool] = effect.multiplier;
                log.debug(`Tool ${effect.tool} animation speed now ${effect.multiplier}x`);
                break;

            case 'max_health':
                this.game.playerMaxHealth += effect.amount;
                this.game.playerHealth = Math.min(this.game.playerHealth + effect.amount, this.game.playerMaxHealth);
                log.debug(`Max health increased to ${this.game.playerMaxHealth}`);
                break;

            default:
                log.warn('Unknown upgrade effect type:', effect.type);
        }
    }

    // Check if an upgrade is purchased
    hasUpgrade(upgradeId) {
        return this.purchasedUpgrades.has(upgradeId);
    }

    // === SHOP MENU ===

    renderShopMenu(activeTab = 'buy') {
        const inventory = this.game.inventory;
        const currentGold = inventory.getGold();

        // Store scroll position before re-rendering
        const scrollContainer = this.menuPanel.querySelector('#shop-scroll-container');
        const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;

        // Get all seed types from RESOURCE_TYPES
        const seeds = [];
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            if (resource.category === 'seed') {
                seeds.push(resource);
            }
        }

        // Get all crops and flowers that can be sold
        const sellableItems = [];
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            if ((resource.category === 'crop' || resource.category === 'flower') && resource.sell_price) {
                const count = inventory.getCount(resource);
                if (count > 0) {
                    sellableItems.push({ resource, count });
                }
            }
        }

        let html = `
            <div style="background: linear-gradient(180deg, #4a7c59 0%, #2d5a3c 100%); color: #f5e6c8; padding: 12px 16px; text-align: center; border-bottom: 3px solid #1e3d28;">
                <span style="font-size: 18px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Store</span>
                <button id="close-menu-btn" style="float: right; background: #c9403a; border: 2px solid #8b2a25; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
            <div style="background: linear-gradient(180deg, #3d6b4a 0%, #2d5a3c 100%); color: #ffd700; padding: 8px 16px; display: flex; align-items: center; justify-content: center; gap: 8px; border-bottom: 2px solid #1e3d28;">
                <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px; transform: scale(1.5);"></div>
                <span style="font-size: 16px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${currentGold} Gold</span>
            </div>
            <div style="display: flex; border-bottom: 2px solid #1e3d28;">
                <button id="shop-tab-buy" class="shop-tab" data-tab="buy" style="
                    flex: 1;
                    padding: 12px;
                    background: ${activeTab === 'buy' ? 'linear-gradient(180deg, #4a7c59 0%, #2d5a3c 100%)' : 'linear-gradient(180deg, #3d6b4a 0%, #2d5a3c 100%)'};
                    border: none;
                    border-right: 1px solid #1e3d28;
                    color: #f5e6c8;
                    font-weight: bold;
                    font-size: 14px;
                    cursor: pointer;
                    ${activeTab === 'buy' ? 'border-bottom: 3px solid #4a7c59; margin-bottom: -3px;' : ''}
                ">Buy Seeds</button>
                <button id="shop-tab-sell" class="shop-tab" data-tab="sell" style="
                    flex: 1;
                    padding: 12px;
                    background: ${activeTab === 'sell' ? 'linear-gradient(180deg, #4a7c59 0%, #2d5a3c 100%)' : 'linear-gradient(180deg, #3d6b4a 0%, #2d5a3c 100%)'};
                    border: none;
                    color: #f5e6c8;
                    font-weight: bold;
                    font-size: 14px;
                    cursor: pointer;
                    ${activeTab === 'sell' ? 'border-bottom: 3px solid #4a7c59; margin-bottom: -3px;' : ''}
                ">Sell Items</button>
            </div>
            <div id="shop-scroll-container" style="padding: 16px; height: 60vh; overflow-y: auto;">
        `;

        if (activeTab === 'buy') {
            html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">`;

            for (const seed of seeds) {
                const canAfford = currentGold >= seed.price;
                const owned = inventory.getCount(seed);

                html += `
                    <div style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid ${canAfford ? '#4a7c59' : '#a89070'}; border-radius: 8px; padding: 10px; text-align: center;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 6px auto; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(seed.tileId)}; background-size: 1024px 1024px; transform: scale(2);"></div>
                        </div>
                        <div style="font-size: 11px; color: #5a4a38; font-weight: bold; margin-bottom: 4px;">${seed.name}</div>
                        <div style="font-size: 10px; color: #7a6a5a; margin-bottom: 6px;">Owned: ${owned}</div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 8px;">
                            <div style="width: 12px; height: 12px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                            <span style="font-size: 12px; color: ${canAfford ? '#2d4d1f' : '#c9403a'}; font-weight: bold;">${seed.price}</span>
                        </div>
                        <button class="buy-seed-btn" data-seed-id="${seed.id}" style="
                            padding: 4px 12px;
                            background: ${canAfford ? 'linear-gradient(180deg, #5a8f3e 0%, #3d6b2a 100%)' : 'linear-gradient(180deg, #888 0%, #666 100%)'};
                            border: 2px solid ${canAfford ? '#2d4d1f' : '#444'};
                            border-radius: 4px;
                            color: white;
                            font-weight: bold;
                            font-size: 11px;
                            cursor: ${canAfford ? 'pointer' : 'not-allowed'};
                            ${canAfford ? '' : 'opacity: 0.6;'}
                        ">Buy</button>
                    </div>
                `;
            }

            html += `</div>`;
        } else {
            // Sell tab
            if (sellableItems.length === 0) {
                html += `<p style="text-align: center; color: #7a6a5a; font-style: italic; padding: 20px;">No items to sell. Harvest crops and flowers to sell them here!</p>`;
            } else {
                html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">`;

                for (const item of sellableItems) {
                    html += `
                        <div style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #4a7c59; border-radius: 8px; padding: 10px; text-align: center;">
                            <div style="width: 32px; height: 32px; margin: 0 auto 6px auto; display: flex; align-items: center; justify-content: center;">
                                <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(item.resource.tileId)}; background-size: 1024px 1024px; transform: scale(2);"></div>
                            </div>
                            <div style="font-size: 11px; color: #5a4a38; font-weight: bold; margin-bottom: 4px;">${item.resource.name}</div>
                            <div style="font-size: 10px; color: #7a6a5a; margin-bottom: 6px;">Owned: ${item.count}</div>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 8px;">
                                <div style="width: 12px; height: 12px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                                <span style="font-size: 12px; color: #2d4d1f; font-weight: bold;">${item.resource.sell_price}</span>
                            </div>
                            <button class="sell-item-btn" data-resource-id="${item.resource.id}" style="
                                padding: 4px 12px;
                                background: linear-gradient(180deg, #5a8f3e 0%, #3d6b2a 100%);
                                border: 2px solid #2d4d1f;
                                border-radius: 4px;
                                color: white;
                                font-weight: bold;
                                font-size: 11px;
                                cursor: pointer;
                            ">Sell</button>
                        </div>
                    `;
                }

                html += `</div>`;
            }
        }

        html += '</div>';
        this.menuPanel.innerHTML = html;

        // Restore scroll position
        const newScrollContainer = this.menuPanel.querySelector('#shop-scroll-container');
        if (newScrollContainer && scrollPosition > 0) {
            newScrollContainer.scrollTop = scrollPosition;
        }

        // Store active tab
        this.shopActiveTab = activeTab;

        // Add close button listener
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());

        // Add tab button listeners
        const tabButtons = document.querySelectorAll('.shop-tab');
        for (const btn of tabButtons) {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.renderShopMenu(tab);
            });
        }

        // Add buy button listeners
        const buyButtons = document.querySelectorAll('.buy-seed-btn');
        for (const btn of buyButtons) {
            btn.addEventListener('click', (e) => {
                const seedId = e.target.dataset.seedId;
                this.purchaseSeed(seedId);
            });
        }

        // Add sell button listeners
        const sellButtons = document.querySelectorAll('.sell-item-btn');
        for (const btn of sellButtons) {
            btn.addEventListener('click', (e) => {
                const resourceId = e.target.dataset.resourceId;
                this.sellItem(resourceId);
            });
        }
    }

    purchaseSeed(seedId) {
        const inventory = this.game.inventory;

        // Find the seed resource
        let seedResource = null;
        for (const key of Object.keys(RESOURCE_TYPES)) {
            if (RESOURCE_TYPES[key].id === seedId) {
                seedResource = RESOURCE_TYPES[key];
                break;
            }
        }

        if (!seedResource) {
            log.warn('Unknown seed ID:', seedId);
            return;
        }

        // Check if player can afford it
        if (!inventory.has(RESOURCE_TYPES.GOLD, seedResource.price)) {
            log.debug('Not enough gold to buy:', seedResource.name);
            return;
        }

        // Deduct gold and add seed
        inventory.spendGold(seedResource.price);
        inventory.add(seedResource, 1);

        log.debug(`Purchased ${seedResource.name} for ${seedResource.price} gold`);

        // Re-render shop menu preserving tab and scroll
        this.renderShopMenu(this.shopActiveTab || 'buy');
    }

    sellItem(resourceId) {
        const inventory = this.game.inventory;

        // Find the resource
        let resource = null;
        for (const key of Object.keys(RESOURCE_TYPES)) {
            if (RESOURCE_TYPES[key].id === resourceId) {
                resource = RESOURCE_TYPES[key];
                break;
            }
        }

        if (!resource) {
            log.warn('Unknown resource ID:', resourceId);
            return;
        }

        // Check if resource has sell_price
        if (!resource.sell_price) {
            log.warn('Resource cannot be sold:', resource.name);
            return;
        }

        // Check if player has the item
        if (!inventory.has(resource, 1)) {
            log.debug('You don\'t have any:', resource.name);
            return;
        }

        // Remove item and add gold
        inventory.remove(resource, 1);
        inventory.addGold(resource.sell_price);

        log.debug(`Sold ${resource.name} for ${resource.sell_price} gold`);

        // Re-render shop menu preserving tab and scroll
        this.renderShopMenu(this.shopActiveTab || 'sell');
    }

    // Get tile position for CSS background
    getTilePosition(tileId) {
        const tilesPerRow = 64;
        const col = tileId % tilesPerRow;
        const row = Math.floor(tileId / tilesPerRow);
        return `-${col * 16}px -${row * 16}px`;
    }
}
