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

// Home upgrade station types
// TODO: replace tileId placeholders with correct upgrade station tile IDs from tileset
const UPGRADE_STATIONS = {
    cauldron: { id: 'cauldron', name: 'Cauldron', description: 'Brew potions to sell', tileId: 2858 },
    anvil:    { id: 'anvil',    name: 'Anvil',    description: 'Forge tool upgrades',  tileId: 2922 },
    shrine:   { id: 'shrine',   name: 'Shrine',   description: 'Craft permanent buffs', tileId: 2857 }
};

// Cauldron recipes (potion crafting)
const CAULDRON_RECIPES = [
    {
        id: 'minor_health_potion', name: 'Minor Health Potion', craftingCycles: 3,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_RADISH, amount: 3 },
            { resource: RESOURCE_TYPES.FLOWER_RED,  amount: 2 }
        ],
        output: RESOURCE_TYPES.MINOR_HEALTH_POTION
    },
    {
        id: 'stamina_tonic', name: 'Stamina Tonic', craftingCycles: 4,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_CARROT, amount: 3 },
            { resource: RESOURCE_TYPES.FLOWER_BLUE, amount: 2 }
        ],
        output: RESOURCE_TYPES.STAMINA_TONIC
    },
    {
        id: 'growth_elixir', name: 'Growth Elixir', craftingCycles: 5,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_PUMPKIN, amount: 2 },
            { resource: RESOURCE_TYPES.FLOWER_WHITE, amount: 3 }
        ],
        output: RESOURCE_TYPES.GROWTH_ELIXIR
    },
    {
        id: 'vitality_brew', name: 'Vitality Brew', craftingCycles: 8,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_CAULIFLOWER, amount: 2 },
            { resource: RESOURCE_TYPES.CROP_SUNFLOWER,   amount: 2 },
            { resource: RESOURCE_TYPES.ORE_GOLD,         amount: 5 }
        ],
        output: RESOURCE_TYPES.VITALITY_BREW
    }
];

// Anvil recipes (derived from UPGRADES; same resources, now require crafting cycles)
const ANVIL_RECIPES = Object.values(UPGRADES).map(u => ({
    id: u.id, name: u.name, description: u.description,
    craftingCycles: 5,
    ingredients: u.cost,
    iconTileId: u.iconTileId,
    effect: u.effect,
    oneTime: true
}));

// Shrine recipes (permanent upgrades)
const SHRINE_RECIPES = [
    {
        id: 'fertile_soil_1', name: 'Fertile Soil I', craftingCycles: 8,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_PARSNIP, amount: 10 },
            { resource: RESOURCE_TYPES.ORE_STONE,    amount: 5 }
        ],
        description: 'Crop growth time −15%',
        prerequisite: null
    },
    {
        id: 'fertile_soil_2', name: 'Fertile Soil II', craftingCycles: 10,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_POTATO, amount: 20 },
            { resource: RESOURCE_TYPES.ORE_IRON,    amount: 10 }
        ],
        description: 'Crop growth time −30% (replaces I)',
        prerequisite: 'fertile_soil_1'
    },
    {
        id: 'bountiful_harvest', name: 'Bountiful Harvest', craftingCycles: 10,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_CABBAGE, amount: 15 },
            { resource: RESOURCE_TYPES.ORE_GOLD,     amount: 10 }
        ],
        description: 'Crops yield +1 extra on harvest',
        prerequisite: null
    },
    {
        id: 'roadside_replenishment', name: 'Roadside Replenishment', craftingCycles: 12,
        ingredients: [
            { resource: RESOURCE_TYPES.CROP_WHEAT, amount: 10 },
            { resource: RESOURCE_TYPES.ORE_MITHRIL, amount: 5 }
        ],
        description: 'Unlocks auto-replenish for roadside stand',
        prerequisite: null
    }
];

export { CAULDRON_RECIPES, ANVIL_RECIPES, SHRINE_RECIPES };

export class UIManager {
    constructor(game) {
        this.game = game;
        this.activeMenu = null;
        this.menuContainer = null;
        this.activeStand = null;
        this.standSlotSubmenu = null;
        this._standSubmenuOutsideClickHandler = null;
        // Crafting menu view state: null | 'pick-upgrade' | 'shrine-confirm'
        this._craftingView = null;
        this._pendingUpgradeSwap = null;

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
        } else if (this.activeMenu === 'stand' && this.activeStand) {
            if (this.standSlotSubmenu) {
                // Submenu is open — refresh stand menu slots without closing it, then update submenu content
                this.renderStandMenu(this.activeStand, true);
                this._refreshStandSlotSubmenu(this._standSubmenuSlotIndex, this.activeStand);
            } else {
                this.renderStandMenu(this.activeStand);
            }
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
        this._closeStandSlotSubmenu();
        this.activeStand = null;
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
            const potions = inventory.getByCategory('potion');

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
            if (potions.length > 0) {
                html += this.renderItemCategory('Potions', potions);
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

    // =========================================================
    // CRAFTING MENU — Home Upgrade Slot System
    // =========================================================

    renderCraftingMenu() {
        const upgrades = this.game.homeUpgrades;
        const installedUpgrade = upgrades ? upgrades.slots[0] : null;

        let html = `
            <div style="background: linear-gradient(180deg, #8b7355 0%, #6b5a45 100%); color: #f5e6c8; padding: 12px 16px; text-align: center; border-bottom: 3px solid #5a4a38;">
                <span style="font-size: 18px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Home Upgrades</span>
                <button id="close-menu-btn" style="float: right; background: #c9403a; border: 2px solid #8b2a25; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
            <div style="padding: 16px; max-height: 60vh; overflow-y: auto;">
        `;

        switch (this._craftingView) {
            case 'pick-upgrade':
                html += this._renderUpgradePicker();
                break;
            case 'shrine-confirm':
                html += this._renderShrineConfirm();
                break;
            default:
                html += this._renderSlotArea(installedUpgrade);
                html += this._renderRecipeArea(installedUpgrade, upgrades);
        }

        html += '</div>';
        this.menuPanel.innerHTML = html;
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());
        this._attachCraftingListeners(installedUpgrade, upgrades);
    }

    _renderSlotArea(installedUpgrade) {
        const station = installedUpgrade ? UPGRADE_STATIONS[installedUpgrade] : null;
        let slotContent;
        if (station) {
            slotContent = `<div style="width:16px;height:16px;image-rendering:pixelated;background-image:url('Tileset/spr_tileset_sunnysideworld_16px.png');background-position:${this.getTilePosition(station.tileId)};background-size:1024px 1024px;transform:scale(3.5);transform-origin:center;"></div>`;
        } else {
            slotContent = `<span style="font-size:28px;color:#a89070;line-height:1;">+</span>`;
        }

        let html = `
            <div style="margin-bottom:14px;">
                <div style="font-size:12px;color:#7a6a5a;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Upgrade Slot</div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <button id="crafting-slot-btn" style="
                        width:64px;height:64px;
                        background:linear-gradient(180deg,#fff 0%,#e8e0d0 100%);
                        border:2px solid ${station ? '#8b6914' : '#a89070'};
                        border-radius:8px;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;
                        transition:border-color 0.15s;
                    ">${slotContent}</button>
                    ${station ? `
                        <div>
                            <div style="font-weight:bold;color:#5a4a38;font-size:14px;">${station.name}</div>
                            <div style="font-size:11px;color:#7a6a5a;">${station.description}</div>
                            <button id="crafting-swap-btn" style="margin-top:4px;padding:3px 10px;background:linear-gradient(180deg,#8b7355 0%,#6b5a45 100%);border:2px solid #5a4a38;border-radius:4px;color:#f5e6c8;font-size:11px;cursor:pointer;">Swap</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        return html;
    }

    _renderUpgradePicker() {
        let html = `
            <div style="margin-bottom:12px;">
                <div style="font-size:13px;font-weight:bold;color:#5a4a38;margin-bottom:12px;">Choose an Upgrade</div>
        `;
        for (const station of Object.values(UPGRADE_STATIONS)) {
            html += `
                <div class="upgrade-station-choice" data-station-id="${station.id}" style="
                    display:flex;align-items:center;gap:12px;padding:10px;margin-bottom:8px;
                    background:linear-gradient(180deg,#fff 0%,#e8e0d0 100%);
                    border:2px solid #a89070;border-radius:8px;cursor:pointer;
                ">
                    <div style="width:16px;height:16px;image-rendering:pixelated;background-image:url('Tileset/spr_tileset_sunnysideworld_16px.png');background-position:${this.getTilePosition(station.tileId)};background-size:1024px 1024px;transform:scale(2.5);transform-origin:center;flex-shrink:0;"></div>
                    <div style="margin-left:20px;">
                        <div style="font-weight:bold;color:#5a4a38;font-size:13px;">${station.name}</div>
                        <div style="font-size:11px;color:#7a6a5a;">${station.description}</div>
                    </div>
                </div>
            `;
        }
        html += `<button id="crafting-back-btn" style="margin-top:8px;padding:6px 14px;background:linear-gradient(180deg,#8b7355 0%,#6b5a45 100%);border:2px solid #5a4a38;border-radius:4px;color:#f5e6c8;font-size:12px;cursor:pointer;">← Back</button>`;
        html += `</div>`;
        return html;
    }

    _renderShrineConfirm() {
        return `
            <div style="padding:12px;background:linear-gradient(180deg,#fff8e0 0%,#f5e6c8 100%);border:2px solid #c9403a;border-radius:8px;margin-bottom:12px;">
                <div style="font-size:14px;font-weight:bold;color:#c9403a;margin-bottom:8px;">⚠ Remove Shrine?</div>
                <div style="font-size:12px;color:#5a4a38;margin-bottom:12px;">Removing the Shrine will lose all permanent upgrades crafted with it. Are you sure?</div>
                <div style="display:flex;gap:8px;">
                    <button id="shrine-confirm-yes" style="padding:6px 16px;background:linear-gradient(180deg,#c9403a 0%,#8b2a25 100%);border:2px solid #5a1a15;border-radius:4px;color:white;font-weight:bold;font-size:12px;cursor:pointer;">Confirm</button>
                    <button id="shrine-confirm-no" style="padding:6px 16px;background:linear-gradient(180deg,#8b7355 0%,#6b5a45 100%);border:2px solid #5a4a38;border-radius:4px;color:#f5e6c8;font-size:12px;cursor:pointer;">Cancel</button>
                </div>
            </div>
        `;
    }

    _renderRecipeArea(installedUpgrade, upgrades) {
        if (!installedUpgrade) {
            return `<p style="text-align:center;color:#7a6a5a;font-style:italic;margin-top:8px;">Install an upgrade to unlock crafting recipes.</p>`;
        }

        let html = `<div style="border-top:2px solid #c4a882;padding-top:12px;">`;
        switch (installedUpgrade) {
            case 'cauldron': html += this._renderCauldronRecipes(); break;
            case 'anvil':    html += this._renderAnvilRecipes(upgrades); break;
            case 'shrine':   html += this._renderShrineRecipes(upgrades); break;
        }
        html += `</div>`;
        return html;
    }

    _renderCauldronRecipes() {
        let html = `<div style="font-size:13px;font-weight:bold;color:#5a4a38;margin-bottom:10px;">Cauldron Recipes</div>`;
        for (const recipe of CAULDRON_RECIPES) {
            html += this._renderRecipeRow(recipe, false, false);
        }
        return html;
    }

    _renderAnvilRecipes(upgrades) {
        const purchased = upgrades?.purchasedToolUpgrades ?? new Set();
        let html = `<div style="font-size:13px;font-weight:bold;color:#5a4a38;margin-bottom:10px;">Anvil Recipes</div>`;
        for (const recipe of ANVIL_RECIPES) {
            const done = purchased.has(recipe.id);
            html += this._renderRecipeRow(recipe, done, false);
        }
        return html;
    }

    _renderShrineRecipes(upgrades) {
        const su = upgrades?.shrineUpgrades ?? {};
        const isDone = {
            fertile_soil_1: su.fertileSoilLevel >= 1,
            fertile_soil_2: su.fertileSoilLevel >= 2,
            bountiful_harvest: !!su.bountifulHarvest,
            roadside_replenishment: !!su.roadsideReplenishment
        };
        const allDone = Object.values(isDone).every(Boolean);

        let html = `<div style="font-size:13px;font-weight:bold;color:#5a4a38;margin-bottom:10px;">Shrine Recipes</div>`;
        if (allDone) {
            html += `<p style="text-align:center;color:#2d4d1f;font-style:italic;">All upgrades complete ✓</p>`;
        } else {
            for (const recipe of SHRINE_RECIPES) {
                const done = isDone[recipe.id] ?? false;
                const locked = recipe.prerequisite ? !isDone[recipe.prerequisite] : false;
                if (done && recipe.id === 'fertile_soil_1' && isDone.fertile_soil_2) continue; // hide I when II is done
                html += this._renderRecipeRow(recipe, done, locked);
            }
        }
        return html;
    }

    // Render a single recipe row (used by all three stations)
    _renderRecipeRow(recipe, isDone, isLocked) {
        const inventory = this.game.inventory;
        const canAfford = !isDone && !isLocked && recipe.ingredients.every(
            ing => inventory.has(ing.resource, ing.amount)
        );
        const iconTileId = recipe.iconTileId ?? recipe.output?.tileId ?? 2857;

        let ingredientHtml = '';
        for (const ing of recipe.ingredients) {
            const owned = inventory.getCount(ing.resource);
            const ok = owned >= ing.amount;
            ingredientHtml += `
                <span style="font-size:10px;color:${ok ? '#2d4d1f' : '#c9403a'};">
                    ${ing.amount}×${ing.resource.name} (${owned})
                </span>
            `;
        }

        let actionHtml;
        if (isDone) {
            actionHtml = `<span style="font-size:11px;color:#2d4d1f;font-weight:bold;">✓ Done</span>`;
        } else if (isLocked) {
            actionHtml = `<span style="font-size:10px;color:#9a7a5a;font-style:italic;">Locked</span>`;
        } else {
            actionHtml = `
                <button class="craft-recipe-btn" data-recipe-id="${recipe.id}" style="
                    padding:4px 10px;
                    background:${canAfford ? 'linear-gradient(180deg,#5a8f3e 0%,#3d6b2a 100%)' : 'linear-gradient(180deg,#888 0%,#666 100%)'};
                    border:2px solid ${canAfford ? '#2d4d1f' : '#444'};
                    border-radius:4px;color:white;font-weight:bold;font-size:11px;
                    cursor:${canAfford ? 'pointer' : 'not-allowed'};
                    ${canAfford ? '' : 'opacity:0.6;'}
                ">Craft</button>
            `;
        }

        const descriptionHtml = recipe.description
            ? `<div style="font-size:10px;color:#7a6a5a;">${recipe.description}</div>`
            : '';

        return `
            <div style="
                display:flex;align-items:center;justify-content:space-between;gap:8px;
                padding:8px;margin-bottom:8px;
                background:linear-gradient(180deg,#fff 0%,#e8e0d0 100%);
                border:2px solid ${isDone ? '#2d4d1f' : '#a89070'};
                border-radius:6px;${isDone ? 'opacity:0.65;' : ''}
            ">
                <div style="width:16px;height:16px;image-rendering:pixelated;background-image:url('Tileset/spr_tileset_sunnysideworld_16px.png');background-position:${this.getTilePosition(iconTileId)};background-size:1024px 1024px;transform:scale(2);transform-origin:center;flex-shrink:0;"></div>
                <div style="flex:1;margin-left:16px;">
                    <div style="font-weight:bold;font-size:12px;color:#5a4a38;">${recipe.name}</div>
                    ${descriptionHtml}
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:3px;">${ingredientHtml}</div>
                </div>
                <div style="flex-shrink:0;">${actionHtml}</div>
            </div>
        `;
    }

    _attachCraftingListeners(installedUpgrade, upgrades) {
        // Close button already attached in renderCraftingMenu

        // Slot button
        document.getElementById('crafting-slot-btn')?.addEventListener('click', () => {
            this._craftingView = 'pick-upgrade';
            this._pendingUpgradeSwap = true;
            this.renderCraftingMenu();
        });

        // Swap button
        document.getElementById('crafting-swap-btn')?.addEventListener('click', () => {
            this._craftingView = 'pick-upgrade';
            this._pendingUpgradeSwap = true;
            this.renderCraftingMenu();
        });

        // Back button
        document.getElementById('crafting-back-btn')?.addEventListener('click', () => {
            this._craftingView = null;
            this._pendingUpgradeSwap = null;
            this.renderCraftingMenu();
        });

        // Upgrade station choices
        for (const btn of this.menuPanel.querySelectorAll('.upgrade-station-choice')) {
            btn.addEventListener('click', () => {
                const stationId = btn.dataset.stationId;
                this._installUpgrade(stationId);
            });
        }

        // Shrine confirm / cancel
        document.getElementById('shrine-confirm-yes')?.addEventListener('click', () => {
            this._confirmShrineRemoval();
        });
        document.getElementById('shrine-confirm-no')?.addEventListener('click', () => {
            this._craftingView = null;
            this._pendingUpgradeSwap = null;
            this.renderCraftingMenu();
        });

        // Craft recipe buttons
        for (const btn of this.menuPanel.querySelectorAll('.craft-recipe-btn')) {
            btn.addEventListener('click', () => {
                this._submitCraftingJob(btn.dataset.recipeId, installedUpgrade, upgrades);
            });
        }
    }

    _installUpgrade(stationId) {
        const upgrades = this.game.homeUpgrades;
        if (!upgrades) return;
        const currentSlot = upgrades.slots[0];

        if (currentSlot === stationId) {
            // Already installed — just go back
            this._craftingView = null;
            this._pendingUpgradeSwap = null;
            this.renderCraftingMenu();
            return;
        }

        if (currentSlot === 'shrine') {
            // Warn before removing shrine
            this._craftingView = 'shrine-confirm';
            this._pendingUpgradeSwap = stationId;
            this.renderCraftingMenu();
            return;
        }

        upgrades.slots[0] = stationId;
        this._craftingView = null;
        this._pendingUpgradeSwap = null;
        log.info(`Installed upgrade: ${stationId}`);
        this.renderCraftingMenu();
    }

    _confirmShrineRemoval() {
        const upgrades = this.game.homeUpgrades;
        if (!upgrades) return;
        // Reset shrine bonuses
        upgrades.shrineUpgrades = { fertileSoilLevel: 0, bountifulHarvest: false, roadsideReplenishment: false };
        upgrades.slots[0] = this._pendingUpgradeSwap;
        this._craftingView = null;
        this._pendingUpgradeSwap = null;
        log.info('Shrine removed — bonuses reset');
        this.renderCraftingMenu();
    }

    // Submit a crafting job: deduct resources now, queue job for worker to walk and animate.
    _submitCraftingJob(recipeId, stationType, upgrades) {
        const recipe = this._findRecipe(recipeId, stationType);
        if (!recipe) {
            log.warn('Unknown recipe id:', recipeId);
            return;
        }

        // Check affordability
        const canAfford = recipe.ingredients.every(
            ing => this.game.inventory.has(ing.resource, ing.amount)
        );
        if (!canAfford) {
            log.debug('Cannot afford recipe:', recipe.name);
            return;
        }

        // Check one-time recipes (anvil upgrades)
        if (recipe.oneTime && upgrades?.purchasedToolUpgrades?.has(recipe.id)) {
            log.debug('Already purchased:', recipe.name);
            return;
        }

        // Deduct resources immediately
        for (const ing of recipe.ingredients) {
            this.game.inventory.remove(ing.resource, ing.amount);
        }

        // Build refund list
        const refundItems = recipe.ingredients.map(ing => ({ resource: ing.resource, amount: ing.amount }));

        // Queue crafting job
        if (this.game.jobManager) {
            this.game.jobManager.addCraftJob(recipeId, recipe.craftingCycles, refundItems);
        } else {
            // Fallback: apply immediately (should not happen in normal gameplay)
            this.game.applyCraftingEffect(recipeId);
        }

        log.info(`Crafting job queued: ${recipe.name}`);
        this.renderCraftingMenu();
    }

    _findRecipe(recipeId, stationType) {
        const lists = { cauldron: CAULDRON_RECIPES, anvil: ANVIL_RECIPES, shrine: SHRINE_RECIPES };
        const list = lists[stationType];
        return list ? list.find(r => r.id === recipeId) : null;
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

        // Get all crops, flowers, and potions that can be sold
        const sellableItems = [];
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            if ((resource.category === 'crop' || resource.category === 'flower' || resource.category === 'potion') && resource.sell_price) {
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
            // Sell tab — store pays 50% of full value
            if (sellableItems.length === 0) {
                html += `<p style="text-align: center; color: #7a6a5a; font-style: italic; padding: 20px;">No items to sell. Harvest crops and flowers to sell them here!</p>`;
            } else {
                html += `<p style="text-align: center; font-size: 10px; color: #7a6a5a; margin-bottom: 8px; font-style: italic;">Store buys at 50% of full value</p>`;
                html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">`;

                for (const item of sellableItems) {
                    const storePrice = Math.floor(item.resource.sell_price / 2);
                    html += `
                        <div style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #4a7c59; border-radius: 8px; padding: 10px; text-align: center;">
                            <div style="width: 32px; height: 32px; margin: 0 auto 6px auto; display: flex; align-items: center; justify-content: center;">
                                <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(item.resource.tileId)}; background-size: 1024px 1024px; transform: scale(2);"></div>
                            </div>
                            <div style="font-size: 11px; color: #5a4a38; font-weight: bold; margin-bottom: 4px;">${item.resource.name}</div>
                            <div style="font-size: 10px; color: #7a6a5a; margin-bottom: 6px;">Owned: ${item.count}</div>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
                                <div style="width: 12px; height: 12px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                                <span style="font-size: 12px; color: #2d4d1f; font-weight: bold;">${storePrice}</span>
                            </div>
                            <div style="font-size: 9px; color: #9a7a5a; margin-bottom: 8px;">(stand: ${item.resource.sell_price})</div>
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

        // Store buys at 50% of full sell price
        const storePrice = Math.floor(resource.sell_price / 2);
        inventory.remove(resource, 1);
        inventory.addGold(storePrice);

        log.debug(`Sold ${resource.name} at store for ${storePrice} gold (50% of ${resource.sell_price})`);

        // Re-render shop menu preserving tab and scroll
        this.renderShopMenu(this.shopActiveTab || 'sell');
    }

    // === Roadside Stand Menu ===

    openStand(stand) {
        this.activeMenu = 'stand';
        this.activeStand = stand;
        this.renderStandMenu(stand);
        this.menuContainer.style.display = 'flex';
    }

    // Re-render the stand menu if it's currently open (called when replenishment is unlocked)
    refreshStandMenuIfOpen() {
        if (this.activeMenu === 'stand' && this.activeStand) {
            this.renderStandMenu(this.activeStand);
        }
    }

    renderStandMenu(stand, keepSubmenu = false) {
        if (!keepSubmenu) this._closeStandSlotSubmenu();

        let html = `
            <div style="background: linear-gradient(180deg, #8b7355 0%, #6b5a45 100%); color: #f5e6c8; padding: 12px 16px; text-align: center; border-bottom: 3px solid #5a4a38;">
                <span style="font-size: 18px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Roadside Stand</span>
                <button id="close-menu-btn" style="float: right; background: #c9403a; border: 2px solid #8b2a25; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
            <div style="padding: 16px; max-height: 60vh; overflow-y: auto;">
                <p style="color: #5a4a38; font-size: 12px; margin: 0 0 12px 0; text-align: center;">Choose items to sell. Travelers will stop and buy them!</p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
        `;

        for (let i = 0; i < 6; i++) {
            const slot = stand.slots[i];
            const r = slot.resource;
            if (r) {
                const replenishUnlocked = this.game.homeUpgrades?.shrineUpgrades?.roadsideReplenishment ?? false;
                const replenishActive = slot.autoReplenish;
                const replenishBg    = replenishActive ? '#4a7c59' : '#888';
                const replenishBdr   = replenishActive ? '#2d5a3a' : '#666';
                const replenishTitle = replenishActive ? 'Auto-replenish ON' : 'Auto-replenish OFF';
                const replenishBtn   = replenishUnlocked
                    ? `<button class="stand-slot-replenish" data-slot="${i}" title="${replenishTitle}" style="position: absolute; top: 2px; left: 2px; background: ${replenishBg}; border: 1px solid ${replenishBdr}; border-radius: 3px; color: white; font-size: 10px; font-weight: bold; cursor: pointer; padding: 1px 3px; line-height: 1;">⟳</button>`
                    : '';
                html += `
                    <div style="position: relative; background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #4a7c59; border-radius: 8px; padding: 8px; text-align: center; cursor: pointer;" class="stand-slot-btn" data-slot="${i}">
                        <div style="width: 32px; height: 32px; margin: 0 auto 4px auto; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(r.tileId)}; background-size: 1024px 1024px; transform: scale(2);"></div>
                        </div>
                        <div style="font-size: 10px; color: #5a4a38;">${r.name}</div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 2px; margin-top: 2px;">
                            <div style="width: 10px; height: 10px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                            <span style="font-size: 11px; color: #2d4d1f; font-weight: bold;">${r.sell_price}</span>
                        </div>
                        ${replenishBtn}
                        <button class="stand-slot-clear" data-slot="${i}" style="position: absolute; top: 2px; right: 2px; background: #c9403a; border: 1px solid #8b2a25; border-radius: 3px; color: white; font-size: 9px; font-weight: bold; cursor: pointer; padding: 1px 4px; line-height: 1;">×</button>
                    </div>
                `;
            } else {
                html += `
                    <div style="background: linear-gradient(180deg, #f0e8d8 0%, #e0d4b8 100%); border: 2px dashed #a89070; border-radius: 8px; padding: 8px; text-align: center; cursor: pointer; min-height: 72px; display: flex; align-items: center; justify-content: center;" class="stand-slot-btn" data-slot="${i}">
                        <span style="font-size: 24px; color: #a89070; line-height: 1;">+</span>
                    </div>
                `;
            }
        }

        html += `</div></div>`;
        this.menuPanel.innerHTML = html;

        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());

        // Slot click opens submenu
        for (const btn of this.menuPanel.querySelectorAll('.stand-slot-btn')) {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('stand-slot-clear')) return;
                if (e.target.classList.contains('stand-slot-replenish')) return;
                const slotIndex = parseInt(btn.dataset.slot);
                this._openStandSlotSubmenu(slotIndex, stand);
            });
        }

        // Clear button clears the slot
        for (const btn of this.menuPanel.querySelectorAll('.stand-slot-clear')) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIndex = parseInt(btn.dataset.slot);
                stand.clearSlot(slotIndex);
                this.renderStandMenu(stand);
            });
        }

        // Replenish toggle button — top-left of filled slots
        for (const btn of this.menuPanel.querySelectorAll('.stand-slot-replenish')) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIndex = parseInt(btn.dataset.slot);
                stand.slots[slotIndex].autoReplenish = !stand.slots[slotIndex].autoReplenish;
                this.renderStandMenu(stand);
            });
        }
    }

    _openStandSlotSubmenu(slotIndex, stand) {
        this._closeStandSlotSubmenu();
        this._standSubmenuSlotIndex = slotIndex;

        const inventory = this.game.inventory;

        // Count resources already claimed by other slots
        const claimedCounts = {};
        for (let i = 0; i < stand.slots.length; i++) {
            if (i === slotIndex) continue;
            const r = stand.slots[i].resource;
            if (r) claimedCounts[r.id] = (claimedCounts[r.id] || 0) + 1;
        }

        // Build list of resources that can be assigned: have sell_price and player owns at least one unclaimed
        const available = Object.values(RESOURCE_TYPES).filter(r => {
            if (r.sell_price === undefined) return false;
            const owned = inventory.getCount(r);
            const claimed = claimedCounts[r.id] || 0;
            return owned - claimed > 0;
        });

        const submenu = document.createElement('div');
        submenu.id = 'stand-slot-submenu';
        submenu.style.cssText = `
            position: fixed;
            background: linear-gradient(180deg, #f5e6c8 0%, #e8d4a8 100%);
            border: 3px solid #8b7355;
            border-radius: 10px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.5);
            padding: 10px;
            z-index: 300;
            max-height: 60vh;
            overflow-y: auto;
            min-width: 200px;
            max-width: 280px;
        `;

        // Position it to the right of the menu panel, centered vertically
        const panelRect = this.menuPanel.getBoundingClientRect();
        submenu.style.left = `${panelRect.right + 8}px`;
        submenu.style.top = `${Math.max(8, panelRect.top)}px`;

        let innerHtml = `<div style="font-size: 13px; font-weight: bold; color: #5a4a38; margin-bottom: 8px; text-align: center; border-bottom: 2px solid #c4a882; padding-bottom: 6px;">Choose Item for Slot ${slotIndex + 1}</div>`;

        if (available.length === 0) {
            innerHtml += `<p style="color: #7a6a5a; font-size: 12px; text-align: center; font-style: italic;">No sellable items available</p>`;
        } else {
            innerHtml += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">`;
            for (const r of available) {
                const owned = inventory.getCount(r);
                const claimed = claimedCounts[r.id] || 0;
                const net = owned - claimed;
                innerHtml += `
                    <div class="stand-item-choice" data-resource-id="${r.id}" style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #a89070; border-radius: 6px; padding: 6px; text-align: center; cursor: pointer; transition: border-color 0.1s;">
                        <div style="width: 28px; height: 28px; margin: 0 auto 3px auto; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(r.tileId)}; background-size: 1024px 1024px; transform: scale(1.75);"></div>
                        </div>
                        <div style="font-size: 9px; color: #5a4a38; line-height: 1.2;">${r.name}</div>
                        <div style="font-size: 9px; color: #7a6a5a;">x${net}</div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 2px; margin-top: 2px;">
                            <div style="width: 8px; height: 8px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                            <span style="font-size: 9px; color: #2d4d1f; font-weight: bold;">${r.sell_price}</span>
                        </div>
                    </div>
                `;
            }
            innerHtml += `</div>`;
        }

        submenu.innerHTML = innerHtml;
        document.body.appendChild(submenu);
        this.standSlotSubmenu = submenu;

        // Item selection handler
        for (const btn of submenu.querySelectorAll('.stand-item-choice')) {
            btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#4a7c59'; });
            btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#a89070'; });
            btn.addEventListener('click', () => {
                const resourceId = btn.dataset.resourceId;
                const resource = Object.values(RESOURCE_TYPES).find(r => r.id === resourceId);
                if (resource) {
                    stand.slots[slotIndex].resource = resource;
                    stand.slots[slotIndex].autoReplenish = false;
                    this._closeStandSlotSubmenu();
                    this.renderStandMenu(stand);
                }
            });
        }

        // Close submenu when clicking outside of it.
        // We track this listener explicitly so it can be removed in _closeStandSlotSubmenu,
        // preventing stale listeners from accumulating when the menu re-renders due to
        // inventory changes while a submenu is open.
        const closeOnOutside = (e) => {
            if (this.standSlotSubmenu && !this.standSlotSubmenu.contains(e.target)) {
                this._closeStandSlotSubmenu();
            }
        };
        // Defer one tick so the current click event that opened the submenu doesn't immediately close it.
        setTimeout(() => {
            // Only attach if this submenu is still the current one (not already replaced)
            if (this.standSlotSubmenu === submenu) {
                this._standSubmenuOutsideClickHandler = closeOnOutside;
                document.addEventListener('mousedown', closeOnOutside);
            }
        }, 0);
    }

    _refreshStandSlotSubmenu(slotIndex, stand) {
        if (!this.standSlotSubmenu) return;
        const inventory = this.game.inventory;

        const claimedCounts = {};
        for (let i = 0; i < stand.slots.length; i++) {
            if (i === slotIndex) continue;
            const r = stand.slots[i].resource;
            if (r) claimedCounts[r.id] = (claimedCounts[r.id] || 0) + 1;
        }

        const available = Object.values(RESOURCE_TYPES).filter(r => {
            if (r.sell_price === undefined) return false;
            const owned = inventory.getCount(r);
            const claimed = claimedCounts[r.id] || 0;
            return owned - claimed > 0;
        });

        let innerHtml = `<div style="font-size: 13px; font-weight: bold; color: #5a4a38; margin-bottom: 8px; text-align: center; border-bottom: 2px solid #c4a882; padding-bottom: 6px;">Choose Item for Slot ${slotIndex + 1}</div>`;

        if (available.length === 0) {
            innerHtml += `<p style="color: #7a6a5a; font-size: 12px; text-align: center; font-style: italic;">No sellable items available</p>`;
        } else {
            innerHtml += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">`;
            for (const r of available) {
                const owned = inventory.getCount(r);
                const claimed = claimedCounts[r.id] || 0;
                const net = owned - claimed;
                innerHtml += `
                    <div class="stand-item-choice" data-resource-id="${r.id}" style="background: linear-gradient(180deg, #fff 0%, #e8e0d0 100%); border: 2px solid #a89070; border-radius: 6px; padding: 6px; text-align: center; cursor: pointer; transition: border-color 0.1s;">
                        <div style="width: 28px; height: 28px; margin: 0 auto 3px auto; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 16px; height: 16px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(r.tileId)}; background-size: 1024px 1024px; transform: scale(1.75);"></div>
                        </div>
                        <div style="font-size: 9px; color: #5a4a38; line-height: 1.2;">${r.name}</div>
                        <div style="font-size: 9px; color: #7a6a5a;">x${net}</div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 2px; margin-top: 2px;">
                            <div style="width: 8px; height: 8px; image-rendering: pixelated; background-image: url('Tileset/spr_tileset_sunnysideworld_16px.png'); background-position: ${this.getTilePosition(RESOURCE_TYPES.GOLD.tileId)}; background-size: 1024px 1024px;"></div>
                            <span style="font-size: 9px; color: #2d4d1f; font-weight: bold;">${r.sell_price}</span>
                        </div>
                    </div>
                `;
            }
            innerHtml += `</div>`;
        }

        this.standSlotSubmenu.innerHTML = innerHtml;

        for (const btn of this.standSlotSubmenu.querySelectorAll('.stand-item-choice')) {
            btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#4a7c59'; });
            btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#a89070'; });
            btn.addEventListener('click', () => {
                const resourceId = btn.dataset.resourceId;
                const resource = Object.values(RESOURCE_TYPES).find(r => r.id === resourceId);
                if (resource) {
                    stand.slots[slotIndex].resource = resource;
                    stand.slots[slotIndex].autoReplenish = false;
                    this._closeStandSlotSubmenu();
                    this.renderStandMenu(stand);
                }
            });
        }
    }

    _closeStandSlotSubmenu() {
        // Always remove the tracked outside-click listener first to prevent accumulation
        if (this._standSubmenuOutsideClickHandler) {
            document.removeEventListener('mousedown', this._standSubmenuOutsideClickHandler);
            this._standSubmenuOutsideClickHandler = null;
        }
        if (this.standSlotSubmenu) {
            this.standSlotSubmenu.remove();
            this.standSlotSubmenu = null;
        }
        this._standSubmenuSlotIndex = null;
    }

    // Get tile position for CSS background
    getTilePosition(tileId) {
        const tilesPerRow = 64;
        const col = tileId % tilesPerRow;
        const row = Math.floor(tileId / tilesPerRow);
        return `-${col * 16}px -${row * 16}px`;
    }
}
