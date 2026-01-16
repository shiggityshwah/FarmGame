// Tool definitions with tile IDs from tileset
const TOOLS = {
    WATERING_CAN: { id: 'watering_can', tileId: 2858, name: 'Watering Can', animation: 'WATERING' },
    AXE: { id: 'axe', tileId: 2922, name: 'Axe', animation: 'AXE' },
    HOE: { id: 'hoe', tileId: 2986, name: 'Hoe', animation: 'AXE' },
    SWORD: { id: 'sword', tileId: 3050, name: 'Sword', animation: 'ATTACK' },
    SHOVEL: { id: 'shovel', tileId: 3114, name: 'Shovel', animation: 'DIG' },
    FISHING_ROD: { id: 'fishing_rod', tileId: 3178, name: 'Fishing Rod', animation: 'CASTING' },
    PICKAXE: { id: 'pickaxe', tileId: 3113, name: 'Pickaxe', animation: 'MINING' },
    PLANT: { id: 'plant', tileId: 2857, name: 'Plant', animation: 'DOING' }
};

export { TOOLS };

export class Toolbar {
    constructor(game, tilemap) {
        this.game = game;
        this.tilemap = tilemap;
        this.selectedTool = null;
        this.toolButtons = new Map();
        this.cursorDataUrls = new Map();

        this.createToolbar();
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

    onToolClick(tool) {
        if (this.selectedTool && this.selectedTool.id === tool.id) {
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
        document.body.style.cursor = 'default';

        // Notify game
        if (this.game.onToolDeselected) {
            this.game.onToolDeselected();
        }
    }

    getSelectedTool() {
        return this.selectedTool;
    }
}
