import { Logger } from './Logger.js';

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
    PLANT: { id: 'plant', tileId: 2857, name: 'Plant', animation: 'DOING', hasSubmenu: true }
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
        this.queueSelector = null;
        this.selectedQueue = 'all'; // 'all' | 'human' | 'goblin'

        this.createQueueSelector();
        this.createToolbar();
        this.createPlantSubmenu();
    }

    createQueueSelector() {
        const selector = document.createElement('div');
        selector.id = 'queue-selector';
        selector.innerHTML = `
            <button class="queue-btn active" data-queue="all" title="Jobs go to shared queue">All</button>
            <button class="queue-btn" data-queue="human" title="Jobs go to human only">Human</button>
            <button class="queue-btn" data-queue="goblin" title="Jobs go to goblin only">Goblin</button>
        `;
        document.body.appendChild(selector);
        this.queueSelector = selector;

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

    createToolbar() {
        // Create toolbar container
        const toolbar = document.createElement('div');
        toolbar.id = 'toolbar';
        document.body.appendChild(toolbar);

        // Create tool buttons
        const toolOrder = ['WATERING_CAN', 'AXE', 'HOE', 'SWORD', 'SHOVEL', 'FISHING_ROD', 'PICKAXE', 'PLANT'];

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

        // Create crop buttons
        const cropOrder = ['CARROT', 'CAULIFLOWER', 'PUMPKIN', 'SUNFLOWER', 'RADISH',
                          'PARSNIP', 'POTATO', 'CABBAGE', 'BEETROOT', 'WHEAT'];

        for (const cropKey of cropOrder) {
            const crop = CROP_DATA[cropKey];
            const btn = this.createCropButton(crop);
            submenu.appendChild(btn);
        }
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

        // Add click handler
        btn.addEventListener('click', () => this.onCropClick(crop));

        return btn;
    }

    onCropClick(crop) {
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
        // Check if tool has submenu
        if (tool.hasSubmenu) {
            // Toggle submenu visibility
            if (this.plantSubmenu && this.plantSubmenu.classList.contains('open')) {
                // Just close submenu, keep button active
                this.hidePlantSubmenu();
            } else {
                // Close any previous tool selection first
                if (this.selectedTool) {
                    const prevBtn = this.toolButtons.get(this.selectedTool.id);
                    if (prevBtn) prevBtn.classList.remove('active');
                    this.selectedTool = null;
                    this.selectedSeed = null;
                    document.body.style.cursor = 'default';
                    // Notify game of deselection
                    if (this.game.onToolDeselected) {
                        this.game.onToolDeselected();
                    }
                }
                // Show submenu
                this.showPlantSubmenu();
                // Highlight the plant button
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

        // Hide plant submenu if open
        this.hidePlantSubmenu();

        // Notify game
        if (this.game.onToolDeselected) {
            this.game.onToolDeselected();
        }
    }

    getSelectedTool() {
        return this.selectedTool;
    }
}
