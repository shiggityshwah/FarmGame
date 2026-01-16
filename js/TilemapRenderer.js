export class TilemapRenderer {
    constructor() {
        this.tileData = null;
        this.tilesetImage = null;
        this.tileSize = 16;
        this.tilesPerRow = 0;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.loaded = false;
    }

    async load(csvPath, tilesetPath) {
        try {
            // Load CSV file
            const csvResponse = await fetch(csvPath);
            const csvText = await csvResponse.text();
            this.parseCsv(csvText);

            // Load tileset image
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.tileSize);

            this.loaded = true;
            console.log(`Tilemap loaded: ${this.mapWidth}x${this.mapHeight} tiles`);
            console.log(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            console.error('Failed to load tilemap:', error);
            throw error;
        }
    }

    parseCsv(csvText) {
        const lines = csvText.trim().split('\n');
        this.tileData = lines.map(line =>
            line.split(',').map(num => parseInt(num.trim(), 10))
        );
        this.mapHeight = this.tileData.length;
        this.mapWidth = this.tileData[0]?.length || 0;
    }

    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
            img.src = path;
        });
    }

    getTileAt(x, y) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
            return null;
        }
        return this.tileData[y][x];
    }

    setTileAt(x, y, tileId) {
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            this.tileData[y][x] = tileId;
        }
    }

    getTilesetSourceRect(tileId) {
        const col = tileId % this.tilesPerRow;
        const row = Math.floor(tileId / this.tilesPerRow);
        return {
            x: col * this.tileSize,
            y: row * this.tileSize,
            width: this.tileSize,
            height: this.tileSize
        };
    }

    render(ctx, camera) {
        if (!this.loaded) return;

        // Disable image smoothing for crisp pixel art
        ctx.imageSmoothingEnabled = false;

        // Get visible bounds for culling
        const bounds = camera.getVisibleBounds();

        // Calculate which tiles are visible
        const startCol = Math.max(0, Math.floor(bounds.left / this.tileSize));
        const endCol = Math.min(this.mapWidth - 1, Math.ceil(bounds.right / this.tileSize));
        const startRow = Math.max(0, Math.floor(bounds.top / this.tileSize));
        const endRow = Math.min(this.mapHeight - 1, Math.ceil(bounds.bottom / this.tileSize));

        // Render only visible tiles with slight overlap to prevent gaps
        const overlap = 0.5;
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const tileId = this.getTileAt(col, row);
                if (tileId === null) continue;

                const sourceRect = this.getTilesetSourceRect(tileId);
                const worldX = col * this.tileSize;
                const worldY = row * this.tileSize;

                ctx.drawImage(
                    this.tilesetImage,
                    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                    worldX - overlap, worldY - overlap,
                    this.tileSize + overlap * 2, this.tileSize + overlap * 2
                );
            }
        }
    }

    getWorldWidth() {
        return this.mapWidth * this.tileSize;
    }

    getWorldHeight() {
        return this.mapHeight * this.tileSize;
    }

    getRandomTilePosition() {
        const x = Math.floor(Math.random() * this.mapWidth);
        const y = Math.floor(Math.random() * this.mapHeight);
        return {
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2,
            tileX: x,
            tileY: y
        };
    }
}
