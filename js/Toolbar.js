import { Logger } from './Logger.js';
import { BUILDING_DEFS } from './BuildingRegistry.js';

const log = Logger.create('Toolbar');

// Tool definitions with tile IDs from tileset
const TOOLS = {
    WATERING_CAN: { id: 'watering_can', tileId: 2858, name: 'Watering Can', animation: 'WATERING' },
    AXE: { id: 'axe', tileId: 2922, name: 'Axe', animation: 'AXE' },
    HOE: { id: 'hoe', tileId: 2986, name: 'Hoe', animation: 'AXE' },
    SWORD: { id: 'sword', tileId: 3050, name: 'Sword', animation: 'ATTACK' },
    SHOVEL: { id: 'shovel', tileId: 3114, name: 'Shovel', animation: 'DIG' },
    FISHING_ROD: { id: 'fishing_rod', tileId: 3178, name: 'Fishing Rod', animation: 'CASTING' },
    PICKAXE: { id: 'pickaxe', tileId: 3113, name: 'Pickaxe', animation: 'MINING' },
    PLANT: { id: 'plant', tileId: 2857, name: 'Plant', animation: 'DOING', hasSubmenu: true },
    BUILD: { id: 'build', tileId: 3045, name: 'Build', animation: 'HAMMERING', hasSubmenu: true }
};

// Crop data with icon (harvested crop) and seed tile IDs
const CROP_DATA = {
    CARROT: { index: 0, cropTileId: 691, seedTileId: 755, name: 'Carrot' },
    CAULIFLOWER: { index: 1, cropTileId: 692, seedTileId: 756, name: 'Cauliflower' },
    PUMPKIN: { index: 2, cropTileId: 693, seedTileId: 757, name: 'Pumpkin' },
    SUNFLOWER: { index: 3, cropTileId: 694, seedTileId: 758, name: 'Sunflower' },
    RADISH: { index: 4, cropTileId: 695, seedTileId: 759, name: 'Radish' },
    PARSNIP: { index: 5, cropTileId: 696, seedTileId: 760, name: 'Parsnip' },
    POTATO: { index: 6, cropTileId: 697, seedTileId: 761, name: 'Potato' },
    CABBAGE: { index: 7, cropTileId: 698, seedTileId: 762, name: 'Cabbage' },
    BEETROOT: { index: 8, cropTileId: 699, seedTileId: 763, name: 'Beetroot' },
    WHEAT: { index: 9, cropTileId: 700, seedTileId: 764, name: 'Wheat' }
};

export { TOOLS, CROP_DATA };

export class Toolbar {
    constructor(game, tilemap) {
        this.game = game;
        this.tilemap = tilemap;
        this.selectedTool = null;
        this.selectedSeed = null;  // Currently selected seed type for planting
        this.toolButtons = new Map();
        this.cursorDataUrls = new Map();
        this.seedCursorDataUrls = new Map();
        this.plantSubmenu = null;
        this.buildSubmenu = null;
        this._buildBtns = new Map();
        this._specialBuildingSection = null;
        this.queueSelector = null;
        this.selectedQueue = 'all'; // 'all' | 'human' | 'goblin'
        this._seedBtns = new Map(); // cropIndex → button element
        this.replenishMode = false;    // When true, plant jobs create a replenish zone
        this.zoneManageMode = false;   // When true, clicking a tile opens the zone panel

        this.createQueueSelector();
        this.createToolbar();
        this.createPlantSubmenu();
        this.createBuildSubmenu();

        // Subscribe to inventory changes to refresh seed availability badges
        if (this.game.inventory) {
            this.game.inventory.onChange(() => this.refreshSeedSubmenu());
        }
    }

    createQueueSelector() {
        const selector = document.createElement('div');
        selector.id = 'queue-selector';
        // Start with only Human visible; All and Goblin revealed on goblin hire
        selector.innerHTML = `
            <button class="queue-btn" data-queue="all" title="Jobs go to shared queue" style="display:none;">All</button>
            <button class="queue-btn active" data-queue="human" title="Jobs go to human only">Human</button>
            <button class="queue-btn" data-queue="goblin" title="Jobs go to goblin only" style="display:none;">Goblin</button>
        `;
        document.body.appendChild(selector);
        this.queueSelector = selector;

        // Force human queue when goblin is not hired
        this.selectedQueue = 'human';
        if (this.game.jobManager) {
            this.game.jobManager.setActiveQueueTarget('human');
        }

        // Add event listeners
        const buttons = selector.querySelectorAll('.queue-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update visual state
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update selected queue
                this.selectedQueue = btn.dataset.queue;

                // Notify job manager
                if (this.game.jobManager) {
                    this.game.jobManager.setActiveQueueTarget(this.selectedQueue);
                }

                log.debug(`Queue target changed to: ${this.selectedQueue}`);
            });
        });
    }

    /** Show/hide goblin-related queue buttons. Called by Game.hireGoblin(). */
    setGoblinHired(hired) {
        if (!this.queueSelector) return;
        const allBtn = this.queueSelector.querySelector('[data-queue="all"]');
        const goblinBtn = this.queueSelector.querySelector('[data-queue="goblin"]');
        if (allBtn) allBtn.style.display = hired ? '' : 'none';
        if (goblinBtn) goblinBtn.style.display = hired ? '' : 'none';
        // Reset to human queue when goblin is unhired
        if (!hired) {
            this.selectedQueue = 'human';
            this.queueSelector.querySelectorAll('.queue-btn').forEach(b => b.classList.remove('active'));
            const humanBtn = this.queueSelector.querySelector('[data-queue="human"]');
            if (humanBtn) humanBtn.classList.add('active');
            if (this.game.jobManager) this.game.jobManager.setActiveQueueTarget('human');
        }
    }

    createToolbar() {
        // Create toolbar container
        const toolbar = document.createElement('div');
        toolbar.id = 'toolbar';
        document.body.appendChild(toolbar);

        // Create tool buttons
        const toolOrder = ['WATERING_CAN', 'AXE', 'HOE', 'SWORD', 'SHOVEL', 'FISHING_ROD', 'PICKAXE', 'PLANT', 'BUILD'];

        for (const toolKey of toolOrder) {
            const tool = TOOLS[toolKey];
            const btn = this.createToolButton(tool);
            toolbar.appendChild(btn);
            this.toolButtons.set(tool.id, btn);
        }
    }

    createToolButton(tool) {
        const btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.dataset.tool = tool.id;
        btn.title = tool.name;

        // Create canvas to extract and scale tile icon
        const canvas = document.createElement('canvas');
        canvas.width = 64;  // 400% of 16px
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Get source rectangle from tileset
        const src = this.tilemap.getTilesetSourceRect(tool.tileId);

        // Draw scaled tile
        ctx.drawImage(
            this.tilemap.tilesetImage,
            src.x, src.y, src.width, src.height,
            0, 0, 64, 64
        );

        // Create image element from canvas
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        btn.appendChild(img);

        // Water level badge on the watering can button
        if (tool.id === 'watering_can') {
            const badge = document.createElement('span');
            badge.className = 'water-level-badge';
            const max = this.game.wateringCanMaxWater ?? 20;
            badge.textContent = `${max}/${max}`;
            btn.appendChild(badge);
            this._waterLevelBadge = badge;
        }

        // Pre-create cursor data URL (32x32 for better cursor size)
        const cursorCanvas = document.createElement('canvas');
        cursorCanvas.width = 32;
        cursorCanvas.height = 32;
        const cursorCtx = cursorCanvas.getContext('2d');
        cursorCtx.imageSmoothingEnabled = false;
        cursorCtx.drawImage(
            this.tilemap.tilesetImage,
            src.x, src.y, src.width, src.height,
            0, 0, 32, 32
        );
        this.cursorDataUrls.set(tool.id, cursorCanvas.toDataURL('image/png'));

        // Add click handler
        btn.addEventListener('click', () => this.onToolClick(tool));

        return btn;
    }

    createPlantSubmenu() {
        // Create submenu container
        const submenu = document.createElement('div');
        submenu.id = 'plant-submenu';
        submenu.className = 'plant-submenu';
        document.body.appendChild(submenu);
        this.plantSubmenu = submenu;

        // Replenish toggle — marks plant jobs as auto-replanting zones
        const replenishBtn = document.createElement('button');
        replenishBtn.className = 'replenish-toggle-btn';
        replenishBtn.id = 'replenish-toggle-btn';
        replenishBtn.title = 'Toggle auto-replant: planted tiles will be re-seeded after harvest';
        replenishBtn.textContent = '⟳ Auto-Replant';
        submenu.appendChild(replenishBtn);
        replenishBtn.addEventListener('click', () => this._toggleReplenishMode());

        // Create crop buttons
        const cropOrder = ['CARROT', 'CAULIFLOWER', 'PUMPKIN', 'SUNFLOWER', 'RADISH',
                          'PARSNIP', 'POTATO', 'CABBAGE', 'BEETROOT', 'WHEAT'];

        for (const cropKey of cropOrder) {
            const crop = CROP_DATA[cropKey];
            const btn = this.createCropButton(crop);
            submenu.appendChild(btn);
        }

        // Manage Zones button — activates zone-select mode
        const zoneBtn = document.createElement('button');
        zoneBtn.className = 'zone-manage-btn';
        zoneBtn.id = 'zone-manage-btn';
        zoneBtn.title = 'Click a tile in a zone to open zone management options';
        zoneBtn.textContent = '⬚ Manage Zones';
        submenu.appendChild(zoneBtn);
        zoneBtn.addEventListener('click', () => this._enterZoneManageMode());
    }

    _toggleReplenishMode() {
        this.replenishMode = !this.replenishMode;
        const btn = document.getElementById('replenish-toggle-btn');
        if (btn) btn.classList.toggle('active', this.replenishMode);
        log.debug(`Replenish mode: ${this.replenishMode}`);
    }

    _enterZoneManageMode() {
        this.zoneManageMode = true;
        this.hidePlantSubmenu();
        // Deselect any active tool (including plant when submenu was open but no seed chosen)
        if (this.selectedTool) {
            this.deselectTool();
        } else {
            // Plant button may be highlighted even without a formal selectedTool (submenu-open state)
            const plantBtn = this.toolButtons.get('plant');
            if (plantBtn) plantBtn.classList.remove('active');
            document.body.style.cursor = 'default';
            if (this.game.onToolDeselected) this.game.onToolDeselected();
        }
        // Show the zone expand indicator bar as a mode indicator
        const indicator = document.getElementById('zone-expand-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            indicator.querySelector('.zone-indicator-label').textContent = 'Click a tile to select zone…';
        }
        log.debug('Zone manage mode activated');
    }

    exitZoneManageMode() {
        if (!this.zoneManageMode) return;
        this.zoneManageMode = false;
        const indicator = document.getElementById('zone-expand-indicator');
        if (indicator) indicator.style.display = 'none';
        log.debug('Zone manage mode exited');
    }

    createCropButton(crop) {
        const btn = document.createElement('button');
        btn.className = 'seed-btn';
        btn.dataset.crop = crop.index;
        btn.title = crop.name;

        // Create canvas to extract and scale crop icon (harvested crop image)
        const canvas = document.createElement('canvas');
        canvas.width = 48;  // 300% of 16px
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Get source rectangle from tileset - use crop tile ID for button icon
        const cropSrc = this.tilemap.getTilesetSourceRect(crop.cropTileId);

        // Draw scaled crop tile
        ctx.drawImage(
            this.tilemap.tilesetImage,
            cropSrc.x, cropSrc.y, cropSrc.width, cropSrc.height,
            0, 0, 48, 48
        );

        // Create image element from canvas
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        btn.appendChild(img);

        // Seed count badge (shows how many seeds player owns)
        const badge = document.createElement('span');
        badge.className = 'seed-count-badge';
        badge.textContent = '0';
        btn.appendChild(badge);

        // Pre-create cursor data URL using SEED tile (32x32 for cursor)
        const seedSrc = this.tilemap.getTilesetSourceRect(crop.seedTileId);
        const cursorCanvas = document.createElement('canvas');
        cursorCanvas.width = 32;
        cursorCanvas.height = 32;
        const cursorCtx = cursorCanvas.getContext('2d');
        cursorCtx.imageSmoothingEnabled = false;
        cursorCtx.drawImage(
            this.tilemap.tilesetImage,
            seedSrc.x, seedSrc.y, seedSrc.width, seedSrc.height,
            0, 0, 32, 32
        );
        this.seedCursorDataUrls.set(crop.index, cursorCanvas.toDataURL('image/png'));

        // Track button for refresh
        this._seedBtns.set(crop.index, btn);

        // Add click handler
        btn.addEventListener('click', () => this.onCropClick(crop));

        return btn;
    }

    /** Refresh seed count badges and disabled state based on current inventory. */
    refreshSeedSubmenu() {
        if (!this.game.inventory) return;
        for (const [cropIndex, btn] of this._seedBtns) {
            const seedResource = this.game.inventory.getSeedByCropIndex(cropIndex);
            const count = seedResource ? this.game.inventory.getCount(seedResource) : 0;
            const badge = btn.querySelector('.seed-count-badge');
            if (badge) badge.textContent = count;
            if (count === 0) {
                btn.classList.add('seed-unavailable');
            } else {
                btn.classList.remove('seed-unavailable');
            }
        }
    }

    onCropClick(crop) {
        // Check if player has this seed
        if (this.game.inventory) {
            const seedResource = this.game.inventory.getSeedByCropIndex(crop.index);
            const count = seedResource ? this.game.inventory.getCount(seedResource) : 0;
            if (count === 0) {
                log.debug(`No ${crop.name} seeds in inventory`);
                return; // Don't select — player has no seeds
            }
        }

        // Close submenu
        this.hidePlantSubmenu();

        // Set selected seed
        this.selectedSeed = crop;

        // Create a plant tool variant with the seed info
        const plantTool = {
            ...TOOLS.PLANT,
            seedType: crop.index,
            seedName: crop.name
        };

        // Select the plant tool with seed
        this.selectTool(plantTool);

        // Change cursor to seed
        const cursorUrl = this.seedCursorDataUrls.get(crop.index);
        document.body.style.cursor = `url(${cursorUrl}) 16 16, auto`;

        log.debug(`Selected seed: ${crop.name}`);
    }

    showPlantSubmenu() {
        if (this.plantSubmenu) {
            this.plantSubmenu.classList.add('open');
        }
    }

    hidePlantSubmenu() {
        if (this.plantSubmenu) {
            this.plantSubmenu.classList.remove('open');
        }
    }

    onToolClick(tool) {
        // Exit zone manage mode when any regular tool is clicked
        if (this.zoneManageMode) this.exitZoneManageMode();

        // Check if tool has submenu
        if (tool.hasSubmenu) {
            const isPlant = tool.id === 'plant';
            const isBuild = tool.id === 'build';
            const submenu = isPlant ? this.plantSubmenu : isBuild ? this.buildSubmenu : null;
            const isOpen = submenu && submenu.classList.contains('open');

            if (isOpen) {
                // Close submenu and fully deselect the button
                if (isPlant) this.hidePlantSubmenu();
                if (isBuild) this.hideBuildSubmenu();
                const btn = this.toolButtons.get(tool.id);
                if (btn) btn.classList.remove('active');
                this.selectedTool = null;
                this.selectedSeed = null;
                document.body.style.cursor = 'default';
                if (this.game.onToolDeselected) this.game.onToolDeselected();
            } else {
                // Close any previous tool selection first
                if (this.selectedTool) {
                    const prevBtn = this.toolButtons.get(this.selectedTool.id);
                    if (prevBtn) prevBtn.classList.remove('active');
                    this.selectedTool = null;
                    this.selectedSeed = null;
                    document.body.style.cursor = 'default';
                    if (this.game.onToolDeselected) this.game.onToolDeselected();
                }
                // Close any other open submenu
                this.hidePlantSubmenu();
                this.hideBuildSubmenu();
                // Show this submenu
                if (isPlant) this.showPlantSubmenu();
                if (isBuild) this.showBuildSubmenu();
                // Highlight the button
                const btn = this.toolButtons.get(tool.id);
                if (btn) btn.classList.add('active');
            }
        } else if (this.selectedTool && this.selectedTool.id === tool.id) {
            // Deselect current tool
            this.deselectTool();
        } else {
            // Select new tool
            this.selectTool(tool);
        }
    }

    selectTool(tool) {
        // Deselect previous
        if (this.selectedTool) {
            const prevBtn = this.toolButtons.get(this.selectedTool.id);
            if (prevBtn) prevBtn.classList.remove('active');
        }

        this.selectedTool = tool;

        // Highlight button
        const btn = this.toolButtons.get(tool.id);
        if (btn) btn.classList.add('active');

        // Change cursor
        const cursorUrl = this.cursorDataUrls.get(tool.id);
        document.body.style.cursor = `url(${cursorUrl}) 16 16, auto`;

        // Notify game
        if (this.game.onToolSelected) {
            this.game.onToolSelected(tool);
        }
    }

    deselectTool() {
        if (this.selectedTool) {
            const btn = this.toolButtons.get(this.selectedTool.id);
            if (btn) btn.classList.remove('active');
        }

        this.selectedTool = null;
        this.selectedSeed = null;
        document.body.style.cursor = 'default';

        // Hide submenus if open
        this.hidePlantSubmenu();
        this.hideBuildSubmenu();

        // Notify game
        if (this.game.onToolDeselected) {
            this.game.onToolDeselected();
        }
    }

    createBuildSubmenu() {
        const submenu = document.createElement('div');
        submenu.id = 'build-submenu';
        submenu.className = 'build-submenu';
        document.body.appendChild(submenu);
        this.buildSubmenu = submenu;

        // Section 1: Paths
        const pathSection = document.createElement('div');
        pathSection.className = 'build-section';
        const pathTitle = document.createElement('div');
        pathTitle.className = 'build-section-title';
        pathTitle.textContent = 'Paths';
        pathSection.appendChild(pathTitle);

        const pathBtn = document.createElement('button');
        pathBtn.className = 'build-item-btn';
        pathBtn.id = 'place-path-btn';
        pathBtn.innerHTML = `<span class="build-item-name">Stone Path</span><span class="build-item-cost">1 Stone/tile</span>`;
        pathBtn.addEventListener('click', () => {
            this.hideBuildSubmenu();
            const buildBtn = this.toolButtons.get('build');
            if (buildBtn) buildBtn.classList.remove('active');
            if (this.game.enterPathPlacementMode) this.game.enterPathPlacementMode();
        });
        pathSection.appendChild(pathBtn);
        submenu.appendChild(pathSection);

        // Section 2: Houses
        const houseSection = document.createElement('div');
        houseSection.className = 'build-section';
        const houseTitle = document.createElement('div');
        houseTitle.className = 'build-section-title';
        houseTitle.textContent = 'Houses';
        houseSection.appendChild(houseTitle);

        const houseDefs = Object.values(BUILDING_DEFS).filter(d => d.category === 'house' && d.hasTilemap && !d.debugOnly);
        for (const def of houseDefs) {
            const btn = this._createBuildingButton(def);
            houseSection.appendChild(btn);
            this._buildBtns.set(def.id, btn);
        }
        submenu.appendChild(houseSection);

        // Section 3: Special Buildings
        const specialSection = document.createElement('div');
        specialSection.className = 'build-section';
        const specialTitle = document.createElement('div');
        specialTitle.className = 'build-section-title';
        specialTitle.textContent = 'Special Buildings';
        specialSection.appendChild(specialTitle);

        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'build-section-empty';
        emptyMsg.id = 'special-buildings-empty';
        emptyMsg.textContent = 'Recruit villagers to unlock special buildings.';
        specialSection.appendChild(emptyMsg);

        this._specialBuildingSection = specialSection;
        submenu.appendChild(specialSection);
    }

    _createBuildingButton(def) {
        const btn = document.createElement('button');
        btn.className = 'build-item-btn';
        btn.dataset.defId = def.id;
        btn.title = def.name;

        const costParts = [];
        if (def.cost.gold)  costParts.push(`${def.cost.gold}g`);
        if (def.cost.wood)  costParts.push(`${def.cost.wood} Wood`);
        if (def.cost.stone) costParts.push(`${def.cost.stone} Stone`);
        for (const [key, val] of Object.entries(def.cost)) {
            if (!['gold', 'wood', 'stone'].includes(key)) costParts.push(`${val} ${key}`);
        }

        btn.innerHTML = `<span class="build-item-name">${def.name}</span><span class="build-item-cost">${costParts.join(', ')}</span>`;
        btn.addEventListener('click', () => {
            this.hideBuildSubmenu();
            const buildBtn = this.toolButtons.get('build');
            if (buildBtn) buildBtn.classList.remove('active');
            if (this.game.enterBuildingPlacementMode) this.game.enterBuildingPlacementMode(def.id);
        });
        return btn;
    }

    /** Called when a new villager is recruited — refreshes special buildings list. */
    refreshBuildSubmenu() {
        if (!this._specialBuildingSection) return;
        const unlockedIds = this.game.villagerManager?.getUnlockedSpecialBuildings() ?? [];
        const existingBtns = this._specialBuildingSection.querySelectorAll('.build-item-btn');
        existingBtns.forEach(b => b.remove());

        const emptyMsg = document.getElementById('special-buildings-empty');
        if (unlockedIds.length === 0) {
            if (emptyMsg) emptyMsg.style.display = '';
            return;
        }
        if (emptyMsg) emptyMsg.style.display = 'none';

        for (const defId of unlockedIds) {
            const def = BUILDING_DEFS[defId];
            if (!def || !def.hasTilemap) continue;
            const btn = this._createBuildingButton(def);
            this._specialBuildingSection.appendChild(btn);
            this._buildBtns.set(defId, btn);
        }
    }

    showBuildSubmenu() {
        if (this.buildSubmenu) this.buildSubmenu.classList.add('open');
    }

    hideBuildSubmenu() {
        if (this.buildSubmenu) this.buildSubmenu.classList.remove('open');
    }

    getSelectedTool() {
        return this.selectedTool;
    }

    /** Update the water-level badge on the watering can button. */
    refreshWaterDisplay() {
        if (!this._waterLevelBadge) return;
        const cur = this.game.wateringCanWater ?? 0;
        const max = this.game.wateringCanMaxWater ?? 20;
        this._waterLevelBadge.textContent = `${cur}/${max}`;
    }
}
