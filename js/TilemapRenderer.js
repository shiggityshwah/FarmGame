export class TilemapRenderer {
    constructor() {
        this.tileData = null;        // Base layer (grass)
        this.layers = [];            // Additional layers rendered on top
        this.boundaryData = null;    // Collision/boundary layer
        this.tilesetImage = null;
        this.tileSize = 16;
        this.tilesPerRow = 0;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.loaded = false;

        // House tilemap offset (where the house is placed on the map)
        this.houseOffsetX = 0;
        this.houseOffsetY = 0;
        this.houseWidth = 0;
        this.houseHeight = 0;
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

    async generateProceduralMap(width, height, tilesetPath) {
        try {
            // Load tileset image first
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.tileSize);

            // Generate procedural map
            this.mapWidth = width;
            this.mapHeight = height;
            this.tileData = [];

            // Grass tile IDs: mainly 65 and 66, with variations
            const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
            const rareGrassTiles = [132, 133, 134];

            for (let y = 0; y < height; y++) {
                const row = [];
                for (let x = 0; x < width; x++) {
                    // 90% chance for common grass, 10% chance for rare grass
                    const rand = Math.random();
                    if (rand < 0.99) {
                        // Common grass tile
                        const tileIndex = Math.floor(Math.random() * commonGrassTiles.length);
                        row.push(commonGrassTiles[tileIndex]);
                    } else {
                        // Rare grass tile
                        const tileIndex = Math.floor(Math.random() * rareGrassTiles.length);
                        row.push(rareGrassTiles[tileIndex]);
                    }
                }
                this.tileData.push(row);
            }

            this.loaded = true;
            console.log(`Procedural map generated: ${this.mapWidth}x${this.mapHeight} tiles`);
            console.log(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            console.error('Failed to generate procedural map:', error);
            throw error;
        }
    }

    async generateHomeMap(tilesetPath) {
        try {
            // Load tileset image first
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.tileSize);

            // Load the house layer CSVs
            const layer1Response = await fetch('Tileset/home_Tile Layer 1.csv');
            const layer2Response = await fetch('Tileset/home_Tile Layer 2.csv');
            const layer3Response = await fetch('Tileset/home_Tile Layer 3.csv');

            const layer1Text = await layer1Response.text();
            const layer2Text = await layer2Response.text();
            const layer3Text = await layer3Response.text();

            const houseLayer1 = this.parseCsvText(layer1Text);
            const houseLayer2 = this.parseCsvText(layer2Text);
            const houseLayer3 = this.parseCsvText(layer3Text);

            // House dimensions (from the CSV)
            this.houseWidth = houseLayer1[0].length;
            this.houseHeight = houseLayer1.length;

            // Total map: house on top, 10x10 grass area below
            const grassHeight = 10;
            this.mapWidth = this.houseWidth;  // Match house width (10 tiles)
            this.mapHeight = this.houseHeight + grassHeight;

            // House is at the top of the map
            this.houseOffsetX = 0;
            this.houseOffsetY = 0;

            // Generate base layer (grass for the entire map)
            this.tileData = [];
            const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];

            for (let y = 0; y < this.mapHeight; y++) {
                const row = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    // For the house area, use the house layer 1 data
                    if (y < this.houseHeight) {
                        const houseTile = houseLayer1[y][x];
                        if (houseTile !== -1) {
                            row.push(houseTile);
                        } else {
                            // Use grass for transparent house tiles
                            const tileIndex = Math.floor(Math.random() * commonGrassTiles.length);
                            row.push(commonGrassTiles[tileIndex]);
                        }
                    } else {
                        // Grass area below house
                        const tileIndex = Math.floor(Math.random() * commonGrassTiles.length);
                        row.push(commonGrassTiles[tileIndex]);
                    }
                }
                this.tileData.push(row);
            }

            // Store additional layers (layer 2 and 3) with their offsets
            this.layers = [
                { data: houseLayer2, offsetX: this.houseOffsetX, offsetY: this.houseOffsetY },
                { data: houseLayer3, offsetX: this.houseOffsetX, offsetY: this.houseOffsetY }
            ];

            // Create boundary data from non-walkable tiles
            // For now, we'll mark house interior walls as boundaries
            this.boundaryData = this.createBoundaryFromLayers(houseLayer1, houseLayer2, houseLayer3);

            this.loaded = true;
            console.log(`Home map generated: ${this.mapWidth}x${this.mapHeight} tiles`);
            console.log(`House area: ${this.houseWidth}x${this.houseHeight} tiles at (${this.houseOffsetX}, ${this.houseOffsetY})`);
            console.log(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            console.error('Failed to generate home map:', error);
            throw error;
        }
    }

    // Create boundary collision data from house layers
    createBoundaryFromLayers(layer1, layer2, layer3) {
        const boundary = [];
        const height = layer1.length;
        const width = layer1[0].length;

        // Wall/furniture tile IDs that should block movement
        // These are common wall and furniture tiles from the tileset
        const wallTiles = new Set([
            // Walls
            2639, 2640, 2641, 2720, 2831, 2832, 2833,
            2895, 2896, 2897, 2959, 2960, 2961,
            3023, 3024, 3025, 3028, 3029, 3030,
            // Furniture
            2772, 2773, 2774, 2836, 2837, 2838, 2912, 2913,
            2966, 2839
        ]);

        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                const tile1 = layer1[y] ? layer1[y][x] : -1;
                const tile2 = layer2[y] ? layer2[y][x] : -1;
                const tile3 = layer3[y] ? layer3[y][x] : -1;

                // Mark as boundary if any layer has a wall/blocking tile
                const isWall = wallTiles.has(tile1) || wallTiles.has(tile2) || wallTiles.has(tile3);
                row.push(isWall ? 1 : 0);
            }
            boundary.push(row);
        }

        return boundary;
    }

    parseCsvText(csvText) {
        const lines = csvText.trim().split('\n');
        return lines.map(line =>
            line.split(',').map(num => parseInt(num.trim(), 10))
        );
    }

    parseCsv(csvText) {
        this.tileData = this.parseCsvText(csvText);
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

    // Check if a tile is a boundary (blocked for movement)
    isBoundary(x, y) {
        if (!this.boundaryData) return false;

        // Adjust for house offset
        const localX = x - this.houseOffsetX;
        const localY = y - this.houseOffsetY;

        if (localX < 0 || localY < 0 ||
            localY >= this.boundaryData.length ||
            localX >= (this.boundaryData[0]?.length || 0)) {
            return false;
        }

        return this.boundaryData[localY][localX] === 1;
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

        // Render base layer
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const tileId = this.getTileAt(col, row);
                if (tileId === null || tileId === -1) continue;

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

        // Render additional layers on top
        for (const layer of this.layers) {
            this.renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap);
        }
    }

    renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap) {
        const layerData = layer.data;
        const offsetX = layer.offsetX;
        const offsetY = layer.offsetY;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // Calculate local coordinates within the layer
                const localX = col - offsetX;
                const localY = row - offsetY;

                // Skip if outside layer bounds
                if (localY < 0 || localY >= layerData.length ||
                    localX < 0 || localX >= (layerData[0]?.length || 0)) {
                    continue;
                }

                const tileId = layerData[localY][localX];
                if (tileId === -1) continue; // Skip empty tiles

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

    // Get the center of the house area
    getHouseCenter() {
        const centerX = (this.houseOffsetX + this.houseWidth / 2) * this.tileSize;
        const centerY = (this.houseOffsetY + this.houseHeight / 2) * this.tileSize;
        return { x: centerX, y: centerY };
    }

    // Get the spawn position (bottom center of house)
    getPlayerSpawnPosition() {
        // Bottom center of the house area (last row of house, center column)
        const spawnTileX = this.houseOffsetX + Math.floor(this.houseWidth / 2);
        const spawnTileY = this.houseOffsetY + this.houseHeight - 2; // Second to last row inside house

        return {
            x: spawnTileX * this.tileSize + this.tileSize / 2,
            y: spawnTileY * this.tileSize + this.tileSize / 2,
            tileX: spawnTileX,
            tileY: spawnTileY
        };
    }

    getRandomTilePosition() {
        // Only return positions in the grass area (below the house)
        const grassStartY = this.houseOffsetY + this.houseHeight;
        const x = Math.floor(Math.random() * this.mapWidth);
        const y = grassStartY + Math.floor(Math.random() * (this.mapHeight - grassStartY));

        return {
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2,
            tileX: x,
            tileY: y
        };
    }
}
