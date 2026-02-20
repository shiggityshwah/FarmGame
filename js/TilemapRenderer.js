import { Logger } from './Logger.js';

const log = Logger.create('TilemapRenderer');

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

        // New house (house.tmx) - 6x6 building with indoor/outdoor roof toggle
        this.groundLayers = [];     // Ground/wall layers rendered AFTER path edge overlays (above path)
        this.roofLayers = [];       // Rendered above character, hidden when player is inside
        this.newHouseOffsetX = 0;
        this.newHouseOffsetY = 0;
        this.newHouseWidth = 0;
        this.newHouseHeight = 0;

        // Map type tracking - 'procedural' for generated maps, 'home' for premade maps
        this.mapType = null;
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
            this.mapType = 'csv'; // Loaded from CSV, treat as non-procedural
            log.debug(`Tilemap loaded: ${this.mapWidth}x${this.mapHeight} tiles`);
            log.debug(`Tileset: ${this.tilesPerRow} tiles per row (padded: ${this.paddedTileSize}px)`);
        } catch (error) {
            log.error('Failed to load tilemap:', error);
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
            this.mapType = 'procedural';
            log.debug(`Procedural map generated: ${this.mapWidth}x${this.mapHeight} tiles`);
            log.debug(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            log.error('Failed to generate procedural map:', error);
            throw error;
        }
    }

    async generateHomeMap(tilesetPath) {
        try {
            // Load tileset image first
            this.tilesetImage = await this.loadImage(tilesetPath);

            // Calculate tiles per row based on image width and padded tile size
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.paddedTileSize);

            // Load and parse all three TMX files
            const [homeTmxResponse, storeTmxResponse, houseTmxResponse] = await Promise.all([
                fetch('Tileset/home.tmx'),
                fetch('Tileset/store.tmx'),
                fetch('Tileset/house.tmx')
            ]);
            const homeTmxText = await homeTmxResponse.text();
            const storeTmxText = await storeTmxResponse.text();
            const houseTmxText = await houseTmxResponse.text();
            const homeData = this.parseTmx(homeTmxText);
            const storeData = this.parseTmx(storeTmxText);
            const houseData = this.parseTmx(houseTmxText);

            // Store dimensions (both are 10x10)
            this.storeWidth = storeData.width;
            this.storeHeight = storeData.height;

            // Former home dimensions from TMX
            this.houseWidth = homeData.width;
            this.houseHeight = homeData.height;

            // New house (house.tmx) dimensions
            this.newHouseWidth = houseData.width;   // 6
            this.newHouseHeight = houseData.height; // 6

            // Layout: shop above, former home below on west side, new house further SW,
            // grass/farm below new house.
            // E-W path row separates shop and former home.
            const pathRowHeight = 1;
            const newHouseGap = 6;  // 6-tile gap between former home and new house
            const grassHeight = 10;
            this.mapWidth = 20;
            // Total: store(10) + path(1) + formerHome(10) + gap(6) + newHouse(6) + grass(10) = 43
            this.mapHeight = this.storeHeight + pathRowHeight + this.houseHeight +
                             newHouseGap + this.newHouseHeight + grassHeight;

            // Shop above, slightly east of house
            this.storeOffsetX = 2;
            this.storeOffsetY = 0;

            // Former home below shop + path row, on west side
            this.houseOffsetX = 0;
            this.houseOffsetY = this.storeHeight + pathRowHeight; // 11

            // New house: southwest of former home (lower X center, further south)
            // 12 tiles right of map west edge, 6-tile gap below former home bottom (y=20)
            this.newHouseOffsetX = 12;
            this.newHouseOffsetY = this.houseOffsetY + this.houseHeight + newHouseGap; // 27

            // Generate base layer (Ground layers from store & former home + grass elsewhere)
            // NOTE: New house Ground is intentionally kept OUT of the base layer so it can
            // render above path tiles and path edge overlays via groundLayers instead.
            this.tileData = [];
            const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
            const homeGroundLayer = homeData.tileLayers.find(l => l.name === 'Ground');
            const storeGroundLayer = storeData.tileLayers.find(l => l.name === 'Ground');

            for (let y = 0; y < this.mapHeight; y++) {
                const row = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    let tile = -1;

                    // Check if in store/shop area (above, slightly east)
                    if (x >= this.storeOffsetX && x < this.storeOffsetX + this.storeWidth &&
                        y >= this.storeOffsetY && y < this.storeOffsetY + this.storeHeight && storeGroundLayer) {
                        const localX = x - this.storeOffsetX;
                        const localY = y - this.storeOffsetY;
                        tile = storeGroundLayer.data[localY][localX];
                    }
                    // Check if in former home area (below shop, west side)
                    else if (x >= this.houseOffsetX && x < this.houseOffsetX + this.houseWidth &&
                             y >= this.houseOffsetY && y < this.houseOffsetY + this.houseHeight && homeGroundLayer) {
                        const localX = x - this.houseOffsetX;
                        const localY = y - this.houseOffsetY;
                        tile = homeGroundLayer.data[localY][localX];
                    }
                    // New house footprint: leave as grass — Ground layer renders via groundLayers above path tiles

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

            // Layers rendered BELOW character: Decor, Buildings (Base/Detail) for store & former home.
            this.layers = [];

            // Helper to add standard TMX layers (store/home style) with offset
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

            // Add store and former home layers
            addLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            addLayersFromTmx(homeData, this.houseOffsetX, this.houseOffsetY);

            // New house ground/floor layers: rendered AFTER path edge overlays (via renderGroundLayers)
            // Order matters: Ground first (bottom), then Ground Detail, Wall, Wall Detail on top.
            this.groundLayers = [];
            for (const name of ['Ground', 'Ground Detail', 'Wall', 'Wall Detail']) {
                const layer = houseData.tileLayers.find(l => l.name === name);
                if (layer) {
                    this.groundLayers.push({ data: layer.data, offsetX: this.newHouseOffsetX, offsetY: this.newHouseOffsetY });
                }
            }

            // Layers rendered ABOVE character: Buildings (Upper) for store/home;
            // Roof and Roof Detail for new house (conditionally hidden when player is inside).
            this.upperLayers = [];

            const addUpperLayersFromTmx = (tmxData, offsetX, offsetY) => {
                const upperBuildingsLayer = tmxData.tileLayers.find(l => l.name === 'Buildings (Upper)');
                if (upperBuildingsLayer) {
                    this.upperLayers.push({ data: upperBuildingsLayer.data, offsetX, offsetY });
                }
            };

            addUpperLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            addUpperLayersFromTmx(homeData, this.houseOffsetX, this.houseOffsetY);

            // New house roof layers (hidden when player is inside)
            this.roofLayers = [];
            for (const name of ['Roof', 'Roof Detail']) {
                const layer = houseData.tileLayers.find(l => l.name === name);
                if (layer) {
                    this.roofLayers.push({ data: layer.data, offsetX: this.newHouseOffsetX, offsetY: this.newHouseOffsetY });
                }
            }

            // Combine collision rectangles from all TMX files
            this.collisionRects = [];

            for (const rect of storeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.storeOffsetX * this.tileSize,
                    y: rect.y + this.storeOffsetY * this.tileSize,
                    width: rect.width,
                    height: rect.height
                });
            }

            for (const rect of homeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.houseOffsetX * this.tileSize,
                    y: rect.y + this.houseOffsetY * this.tileSize,
                    width: rect.width,
                    height: rect.height
                });
            }

            // New house: use tile-based collision from the Wall layer instead of the TMX
            // collision objects, which are sub-pixel thin (~2-4px) and never hit tile centers.
            // One full 16×16 rect per non-empty Wall tile ensures isBoundary() works correctly.
            const houseWallLayer = houseData.tileLayers.find(l => l.name === 'Wall');
            if (houseWallLayer) {
                for (let localY = 0; localY < this.newHouseHeight; localY++) {
                    for (let localX = 0; localX < this.newHouseWidth; localX++) {
                        if (houseWallLayer.data[localY][localX] >= 0) {
                            this.collisionRects.push({
                                x: (this.newHouseOffsetX + localX) * this.tileSize,
                                y: (this.newHouseOffsetY + localY) * this.tileSize,
                                width: this.tileSize,
                                height: this.tileSize
                            });
                        }
                    }
                }
            }

            log.debug(`Loaded ${this.collisionRects.length} collision rectangles`);

            // Combine interactable objects from all TMX files
            this.interactables = [];

            for (const interactable of storeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.storeOffsetX * this.tileSize,
                    y: interactable.y + this.storeOffsetY * this.tileSize,
                    width: interactable.width,
                    height: interactable.height,
                    action: interactable.action
                });
            }

            for (const interactable of homeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.houseOffsetX * this.tileSize,
                    y: interactable.y + this.houseOffsetY * this.tileSize,
                    width: interactable.width,
                    height: interactable.height,
                    action: interactable.action
                });
            }

            for (const interactable of houseData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.newHouseOffsetX * this.tileSize,
                    y: interactable.y + this.newHouseOffsetY * this.tileSize,
                    width: interactable.width,
                    height: interactable.height,
                    action: interactable.action
                });
            }

            log.debug(`Loaded ${this.interactables.length} interactable objects`);

            this.loaded = true;
            this.mapType = 'home';
            log.debug(`Combined map generated: ${this.mapWidth}x${this.mapHeight} tiles`);
            log.debug(`Store area: ${this.storeWidth}x${this.storeHeight} tiles at (${this.storeOffsetX}, ${this.storeOffsetY})`);
            log.debug(`Former home area: ${this.houseWidth}x${this.houseHeight} tiles at (${this.houseOffsetX}, ${this.houseOffsetY})`);
            log.debug(`New house area: ${this.newHouseWidth}x${this.newHouseHeight} tiles at (${this.newHouseOffsetX}, ${this.newHouseOffsetY})`);
            log.debug(`Tileset: ${this.tilesPerRow} tiles per row`);
        } catch (error) {
            log.error('Failed to generate home map:', error);
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

    // Render new house ground/floor layers (called AFTER path edge overlays so they appear on top)
    renderGroundLayers(ctx, camera) {
        if (!this.loaded || this.groundLayers.length === 0) return;

        const bounds = camera.getVisibleBounds();
        const startCol = Math.max(0, Math.floor(bounds.left / this.tileSize));
        const endCol = Math.min(this.mapWidth - 1, Math.ceil(bounds.right / this.tileSize));
        const startRow = Math.max(0, Math.floor(bounds.top / this.tileSize));
        const endRow = Math.min(this.mapHeight - 1, Math.ceil(bounds.bottom / this.tileSize));

        const overlap = 0.5;
        for (const layer of this.groundLayers) {
            this.renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap);
        }
    }

    // Render new house roof layers (above characters, call only when player is outside)
    renderRoofLayers(ctx, camera) {
        if (!this.loaded || this.roofLayers.length === 0) return;

        const bounds = camera.getVisibleBounds();
        const startCol = Math.max(0, Math.floor(bounds.left / this.tileSize));
        const endCol = Math.min(this.mapWidth - 1, Math.ceil(bounds.right / this.tileSize));
        const startRow = Math.max(0, Math.floor(bounds.top / this.tileSize));
        const endRow = Math.min(this.mapHeight - 1, Math.ceil(bounds.bottom / this.tileSize));

        const overlap = 0.5;
        for (const layer of this.roofLayers) {
            this.renderLayer(ctx, layer, startCol, endCol, startRow, endRow, overlap);
        }
    }

    // Returns true when the player's world position is inside the new house footprint
    isPlayerInsideNewHouse(worldX, worldY) {
        const tileX = Math.floor(worldX / this.tileSize);
        const tileY = Math.floor(worldY / this.tileSize);
        return tileX >= this.newHouseOffsetX && tileX < this.newHouseOffsetX + this.newHouseWidth &&
               tileY >= this.newHouseOffsetY && tileY < this.newHouseOffsetY + this.newHouseHeight;
    }

    // Returns true if the tile is occupied by a custom tilemap (e.g. house.tmx)
    isCustomTilemapTile(tileX, tileY) {
        if (this.newHouseWidth > 0 && this.newHouseHeight > 0) {
            if (tileX >= this.newHouseOffsetX && tileX < this.newHouseOffsetX + this.newHouseWidth &&
                tileY >= this.newHouseOffsetY && tileY < this.newHouseOffsetY + this.newHouseHeight) {
                return true;
            }
        }
        return false;
    }

    getWorldWidth() {
        return this.mapWidth * this.tileSize;
    }

    getWorldHeight() {
        return this.mapHeight * this.tileSize;
    }

    // Get the center of the house for camera positioning
    getHouseCenter() {
        const centerX = (this.houseOffsetX + this.houseWidth / 2) * this.tileSize;
        const centerY = (this.houseOffsetY + this.houseHeight / 2) * this.tileSize;
        return { x: centerX, y: centerY };
    }

    // Get the spawn/idle position: tile just above the new house door
    getPlayerSpawnPosition() {
        // Door is at local (1, 4) in house.tmx Roof layer.
        // One tile above the door = local (1, 3) = the indoor tile in front of the door.
        const spawnTileX = this.newHouseOffsetX + 1; // x=13 with newHouseOffsetX=12
        const spawnTileY = this.newHouseOffsetY + 3; // y=30 (local row 3, one above door at row 4)

        return {
            x: spawnTileX * this.tileSize + this.tileSize / 2,
            y: spawnTileY * this.tileSize + this.tileSize / 2,
            tileX: spawnTileX,
            tileY: spawnTileY
        };
    }

    getRandomTilePosition() {
        // Only return positions in the grass area (below the new house)
        const grassStartY = this.newHouseOffsetY + this.newHouseHeight;
        const x = Math.floor(Math.random() * this.mapWidth);
        const y = grassStartY + Math.floor(Math.random() * (this.mapHeight - grassStartY));

        return {
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2,
            tileX: x,
            tileY: y
        };
    }

    // Check if a tile is in the procedural/farmable area (grass below buildings)
    // For 'home' maps, this is the grass area below the new house
    // For 'procedural' maps, all tiles are farmable
    isInFarmableArea(tileX, tileY) {
        if (this.mapType === 'procedural') {
            // All tiles in procedural maps are farmable
            return true;
        }

        if (this.mapType === 'home') {
            // Only the grass area below the new house is farmable
            const grassStartY = this.newHouseOffsetY + this.newHouseHeight;
            return tileY >= grassStartY;
        }

        // CSV or other map types - not farmable
        return false;
    }
}
