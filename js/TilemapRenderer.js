export class TilemapRenderer {
    constructor() {
        this.tileData = null;        // Base layer (grass)
        this.layers = [];            // Additional layers rendered on top
        this.upperLayers = [];       // Layers rendered above character (Buildings Upper)
        this.boundaryData = null;    // Collision/boundary layer
        this.tilesetImage = null;
        this.tileSize = 16;          // Logical tile size (used for world coordinates)
        this.paddedTileSize = 18;    // Tile size in padded tileset (tileSize + padding*2)
        this.padding = 1;            // Padding around each tile in the tileset
        this.tilesPerRow = 0;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.loaded = false;

        // House tilemap offset (where the house is placed on the map)
        this.houseOffsetX = 0;
        this.houseOffsetY = 0;
        this.houseWidth = 0;
        this.houseHeight = 0;

        // Store tilemap offset (where the store is placed on the map)
        this.storeOffsetX = 0;
        this.storeOffsetY = 0;
        this.storeWidth = 0;
        this.storeHeight = 0;

        // Collision rectangles from TMX object layer
        this.collisionRects = [];

        // Interactable rectangles from TMX object layer
        this.interactables = [];
    }

    async load(csvPath, tilesetPath) {
        try {
            // Load CSV file
            const csvResponse = await fetch(csvPath);
            const csvText = await csvResponse.text();
            this.parseCsv(csvText);

            // Load tileset image
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width and padded tile size
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.paddedTileSize);

            this.loaded = true;
            console.log(`Tilemap loaded: ${this.mapWidth}x${this.mapHeight} tiles`);
            console.log(`Tileset: ${this.tilesPerRow} tiles per row (padded: ${this.paddedTileSize}px)`);
        } catch (error) {
            console.error('Failed to load tilemap:', error);
            throw error;
        }
    }

    async generateProceduralMap(width, height, tilesetPath) {
        try {
            // Load tileset image first
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width and padded tile size
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.paddedTileSize);

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

            // Calculate tiles per row based on image width and padded tile size
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.paddedTileSize);

            // Load and parse both TMX files
            const [homeTmxResponse, storeTmxResponse] = await Promise.all([
                fetch('Tileset/home.tmx'),
                fetch('Tileset/store.tmx')
            ]);
            const homeTmxText = await homeTmxResponse.text();
            const storeTmxText = await storeTmxResponse.text();
            const homeData = this.parseTmx(homeTmxText);
            const storeData = this.parseTmx(storeTmxText);

            // Store dimensions (both are 10x10)
            this.storeWidth = storeData.width;
            this.storeHeight = storeData.height;

            // House dimensions from TMX
            this.houseWidth = homeData.width;
            this.houseHeight = homeData.height;

            // Total map: store on left, house on right, grass area below both
            // Store is placed directly to the left of home
            const grassHeight = 10;
            this.mapWidth = this.storeWidth + this.houseWidth; // 20 tiles wide (10 + 10)
            this.mapHeight = Math.max(this.houseHeight, this.storeHeight) + grassHeight; // 20 tiles tall

            // Store is on the left (x: 0-9)
            this.storeOffsetX = 0;
            this.storeOffsetY = 0;

            // House is on the right (x: 10-19)
            this.houseOffsetX = this.storeWidth;
            this.houseOffsetY = 0;

            // Generate base layer (Ground layers from both TMX + grass below)
            this.tileData = [];
            const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
            const homeGroundLayer = homeData.tileLayers.find(l => l.name === 'Ground');
            const storeGroundLayer = storeData.tileLayers.find(l => l.name === 'Ground');

            for (let y = 0; y < this.mapHeight; y++) {
                const row = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    let tile = -1;

                    // Check if in store area (left side, top)
                    if (x < this.storeWidth && y < this.storeHeight && storeGroundLayer) {
                        tile = storeGroundLayer.data[y][x];
                    }
                    // Check if in home area (right side, top)
                    else if (x >= this.houseOffsetX && x < this.houseOffsetX + this.houseWidth &&
                             y < this.houseHeight && homeGroundLayer) {
                        const localX = x - this.houseOffsetX;
                        tile = homeGroundLayer.data[y][localX];
                    }

                    if (tile >= 0) {
                        row.push(tile);
                    } else {
                        // Empty tile or grass area, fill with random grass
                        const tileIndex = Math.floor(Math.random() * commonGrassTiles.length);
                        row.push(commonGrassTiles[tileIndex]);
                    }
                }
                this.tileData.push(row);
            }

            // Store layers rendered BELOW character: Decor, Buildings (Base), Buildings (Detail)
            // Include layers from both home and store
            this.layers = [];

            // Helper to add layer with offset
            const addLayersFromTmx = (tmxData, offsetX, offsetY) => {
                const decorLayer = tmxData.tileLayers.find(l => l.name === 'Decor');
                const baseBuildingsLayer = tmxData.tileLayers.find(l => l.name === 'Buildings (Base)');
                const detailBuildingsLayer = tmxData.tileLayers.find(l => l.name === 'Buildings (Detail)');

                if (decorLayer) {
                    this.layers.push({ data: decorLayer.data, offsetX, offsetY });
                }
                if (baseBuildingsLayer) {
                    this.layers.push({ data: baseBuildingsLayer.data, offsetX, offsetY });
                }
                if (detailBuildingsLayer) {
                    this.layers.push({ data: detailBuildingsLayer.data, offsetX, offsetY });
                }
            };

            // Add store layers (left side)
            addLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            // Add home layers (right side)
            addLayersFromTmx(homeData, this.houseOffsetX, this.houseOffsetY);

            // Store layers rendered ABOVE character: Buildings (Upper)
            this.upperLayers = [];

            const addUpperLayersFromTmx = (tmxData, offsetX, offsetY) => {
                const upperBuildingsLayer = tmxData.tileLayers.find(l => l.name === 'Buildings (Upper)');
                if (upperBuildingsLayer) {
                    this.upperLayers.push({ data: upperBuildingsLayer.data, offsetX, offsetY });
                }
            };

            // Add store upper layers
            addUpperLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            // Add home upper layers
            addUpperLayersFromTmx(homeData, this.houseOffsetX, this.houseOffsetY);

            // Combine collision rectangles from both TMX files
            this.collisionRects = [];

            // Add store collision rectangles with offset
            for (const rect of storeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.storeOffsetX * this.tileSize,
                    y: rect.y + this.storeOffsetY * this.tileSize,
                    width: rect.width,
                    height: rect.height
                });
            }

            // Add home collision rectangles with offset
            for (const rect of homeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.houseOffsetX * this.tileSize,
                    y: rect.y + this.houseOffsetY * this.tileSize,
                    width: rect.width,
                    height: rect.height
                });
            }

            console.log(`Loaded ${this.collisionRects.length} collision rectangles`);

            // Combine interactable objects from both TMX files
            this.interactables = [];

            // Add store interactables with offset
            for (const interactable of storeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.storeOffsetX * this.tileSize,
                    y: interactable.y + this.storeOffsetY * this.tileSize,
                    width: interactable.width,
                    height: interactable.height,
                    action: interactable.action
                });
            }

            // Add home interactables with offset
            for (const interactable of homeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.houseOffsetX * this.tileSize,
                    y: interactable.y + this.houseOffsetY * this.tileSize,
                    width: interactable.width,
                    height: interactable.height,
                    action: interactable.action
                });
            }

            console.log(`Loaded ${this.interactables.length} interactable objects`);

            this.loaded = true;
            console.log(`Combined map generated: ${this.mapWidth}x${this.mapHeight} tiles`);
            console.log(`Store area: ${this.storeWidth}x${this.storeHeight} tiles at (${this.storeOffsetX}, ${this.storeOffsetY})`);
            console.log(`House area: ${this.houseWidth}x${this.houseHeight} tiles at (${this.houseOffsetX}, ${this.houseOffsetY})`);
            console.log(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            console.error('Failed to generate home map:', error);
            throw error;
        }
    }

    // Parse TMX XML format
    parseTmx(tmxText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(tmxText, 'text/xml');
        const mapNode = doc.querySelector('map');

        const result = {
            width: parseInt(mapNode.getAttribute('width')),
            height: parseInt(mapNode.getAttribute('height')),
            tileWidth: parseInt(mapNode.getAttribute('tilewidth')),
            tileHeight: parseInt(mapNode.getAttribute('tileheight')),
            tileLayers: [],
            collisionRects: [],
            interactables: []
        };

        // Parse tile layers
        const layerNodes = doc.querySelectorAll('layer');
        for (const layerNode of layerNodes) {
            const layerName = layerNode.getAttribute('name');
            const dataNode = layerNode.querySelector('data');
            const csvText = dataNode.textContent.trim();

            // Parse CSV data
            // TMX uses 1-based GIDs (firstgid="1"), but our tileset uses 0-based indices
            // So we subtract 1 from non-zero tile IDs to convert to 0-based
            // GID 0 in TMX means empty tile, which becomes -1 in our system
            const rows = csvText.split('\n').map(line => {
                return line.split(',').filter(s => s.trim() !== '').map(num => {
                    const val = parseInt(num.trim(), 10);
                    if (isNaN(val) || val <= 0) return -1; // Empty tile
                    return val - 1; // Convert 1-based GID to 0-based index
                });
            }).filter(row => row.length > 0);

            result.tileLayers.push({
                name: layerName,
                data: rows
            });
        }

        // Parse object groups (Collision and Interactables)
        const objectGroups = doc.querySelectorAll('objectgroup');
        for (const group of objectGroups) {
            const groupName = group.getAttribute('name');
            const objects = group.querySelectorAll('object');

            for (const obj of objects) {
                const rect = {
                    x: parseFloat(obj.getAttribute('x')),
                    y: parseFloat(obj.getAttribute('y')),
                    width: parseFloat(obj.getAttribute('width')),
                    height: parseFloat(obj.getAttribute('height'))
                };

                if (groupName === 'Collision') {
                    result.collisionRects.push(rect);
                } else if (groupName === 'Interactables') {
                    // Get action property
                    const propsNode = obj.querySelector('properties');
                    let action = null;
                    if (propsNode) {
                        const propNodes = propsNode.querySelectorAll('property');
                        for (const prop of propNodes) {
                            if (prop.getAttribute('name') === 'action') {
                                action = prop.getAttribute('value');
                            }
                        }
                    }
                    result.interactables.push({
                        ...rect,
                        action: action
                    });
                }
            }
        }

        return result;
    }

    // Check if a world position collides with any collision rectangle
    isWorldPositionBlocked(worldX, worldY) {
        for (const rect of this.collisionRects) {
            if (worldX >= rect.x && worldX < rect.x + rect.width &&
                worldY >= rect.y && worldY < rect.y + rect.height) {
                return true;
            }
        }
        return false;
    }

    // Get interactable at a world position
    getInteractableAt(worldX, worldY) {
        for (const interactable of this.interactables) {
            if (worldX >= interactable.x && worldX < interactable.x + interactable.width &&
                worldY >= interactable.y && worldY < interactable.y + interactable.height) {
                return interactable;
            }
        }
        return null;
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
        // Convert tile coordinates to world coordinates (center of tile)
        const worldX = x * this.tileSize + this.tileSize / 2;
        const worldY = y * this.tileSize + this.tileSize / 2;

        // Check collision rectangles
        return this.isWorldPositionBlocked(worldX, worldY);
    }

    getTilesetSourceRect(tileId) {
        // Note: Tile IDs are used directly as indices (Tiled GID convention)
        // For padded tilesets, each tile occupies paddedTileSize pixels but we
        // sample from the inner tileSize area (skipping the padding)
        const col = tileId % this.tilesPerRow;
        const row = Math.floor(tileId / this.tilesPerRow);
        return {
            x: col * this.paddedTileSize + this.padding,
            y: row * this.paddedTileSize + this.padding,
            width: this.tileSize,
            height: this.tileSize
        };
    }

    getTilesetSourceRectWithPadding(tileId, overlap) {
        // Same as getTilesetSourceRect but extends into the padding area
        // to allow slight overlap when rendering to prevent subpixel gaps
        const col = tileId % this.tilesPerRow;
        const row = Math.floor(tileId / this.tilesPerRow);
        return {
            x: col * this.paddedTileSize + this.padding - overlap,
            y: row * this.paddedTileSize + this.padding - overlap,
            width: this.tileSize + overlap * 2,
            height: this.tileSize + overlap * 2
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

        // Small overlap to prevent subpixel gaps between tiles.
        // Since we use a padded tileset, we can safely sample slightly beyond
        // the tile boundary - the padding contains the correct edge pixels.
        const overlap = 0.5;

        // Render base layer
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const tileId = this.getTileAt(col, row);
                if (tileId === null || tileId === -1) continue;

                const sourceRect = this.getTilesetSourceRectWithPadding(tileId, overlap);
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

    renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap = 0) {
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
                if (tileId < 0) continue; // Skip empty tiles (-1)

                const sourceRect = this.getTilesetSourceRectWithPadding(tileId, overlap);
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

    // Render upper layers (above characters)
    renderUpperLayers(ctx, camera) {
        if (!this.loaded || this.upperLayers.length === 0) return;

        const bounds = camera.getVisibleBounds();
        const startCol = Math.max(0, Math.floor(bounds.left / this.tileSize));
        const endCol = Math.min(this.mapWidth - 1, Math.ceil(bounds.right / this.tileSize));
        const startRow = Math.max(0, Math.floor(bounds.top / this.tileSize));
        const endRow = Math.min(this.mapHeight - 1, Math.ceil(bounds.bottom / this.tileSize));

        const overlap = 0.5;
        for (const layer of this.upperLayers) {
            this.renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap);
        }
    }

    getWorldWidth() {
        return this.mapWidth * this.tileSize;
    }

    getWorldHeight() {
        return this.mapHeight * this.tileSize;
    }

    // Get the center of the map (between store and house)
    getHouseCenter() {
        const centerX = (this.mapWidth / 2) * this.tileSize;
        const centerY = (Math.max(this.houseHeight, this.storeHeight) / 2) * this.tileSize;
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
