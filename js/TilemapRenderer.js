import { Logger } from './Logger.js';
import { CONFIG } from './config.js';

const log = Logger.create('TilemapRenderer');

export class TilemapRenderer {
    constructor() {
        this.tileData = null;        // Base layer (grass) — used by CSV/procedural maps
        this.CHUNK_SIZE = 30;        // Tile width/height of one chunk (matches CONFIG.chunks.size)
        this.chunkTiles = new Map(); // Sparse storage for 'chunk' maps: "col,row" → Uint16Array(900)
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

        // Town home (home.tmx) - 10x10 building in bottom-right of town chunk
        this.townHomeOffsetX = 0;
        this.townHomeOffsetY = 0;
        this.townHomeWidth = 0;
        this.townHomeHeight = 0;

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
        if (this.mapType === 'chunk') {
            const { mainPathY, mainPathGap } = CONFIG.chunks;
            const gapEnd = mainPathY + mainPathGap; // 64

            // Great path zone (y=60-63): return virtual tile IDs for pathfinder/walkability.
            // Actual visual is rendered by renderGreatPath() — not stored in chunkTiles.
            if (y >= mainPathY && y < gapEnd) {
                // y=60: N-grass, y=61-62: path tiles (speed boost), y=63: S-grass
                return (y === mainPathY + 1 || y === mainPathY + 2) ? 482 : 65;
            }

            // For world rows below the gap, subtract the gap to get chunk-space Y
            const adjY = y >= gapEnd ? y - mainPathGap : y;
            const cs = this.CHUNK_SIZE;
            const col = Math.floor(x / cs);
            const row = Math.floor(adjY / cs);
            const chunk = this.chunkTiles.get(`${col},${row}`);
            if (!chunk) return 65; // unallocated chunk → default grass
            // Calculate local coordinates within chunk
            const localX = x - col * cs;
            const localY = adjY - row * cs;
            // Convert to 1D index: row * width + col
            const index = localY * cs + localX;
            return chunk[index];
        }
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
            return null;
        }
        if (!this.tileData || !this.tileData[y]) {
            return null;
        }
        return this.tileData[y][x];
    }

    setTileAt(x, y, tileId) {
        if (this.mapType === 'chunk') {
            const { mainPathY, mainPathGap, townRow } = CONFIG.chunks;
            const gapEnd = mainPathY + mainPathGap; // 64

            // Great path zone: these are virtual tiles — no chunk storage, ignore writes
            if (y >= mainPathY && y < gapEnd) return;

            // For world rows below the gap, subtract gap to get chunk-space Y
            const adjY = y >= gapEnd ? y - mainPathGap : y;
            const cs = this.CHUNK_SIZE;
            const col = Math.floor(x / cs);
            const row = Math.floor(adjY / cs);
            const key = `${col},${row}`;
            if (!this.chunkTiles.has(key)) {
                // Allocate this chunk on first write — fills with default grass
                const newChunk = new Uint16Array(cs * cs).fill(65);
                this.chunkTiles.set(key, newChunk);
                // Blend edges with neighboring chunks if they exist
                this._blendChunkEdges(col, row, newChunk);
            }
            const chunk = this.chunkTiles.get(key);
            if (!chunk) {
                log.error(`Chunk ${key} not found after allocation attempt`);
                return;
            }
            // Calculate local coordinates within chunk
            const localX = x - col * cs;
            const localY = adjY - row * cs;
            // Convert to 1D index: row * width + col
            const index = localY * cs + localX;
            chunk[index] = tileId;
            // Expand logical map bounds — add mainPathGap for chunk rows below townRow
            const newMaxX = (col + 1) * cs;
            const newMaxY = (row + 1) * cs + (row > townRow ? mainPathGap : 0);
            if (newMaxX > this.mapWidth)  this.mapWidth  = newMaxX;
            if (newMaxY > this.mapHeight) this.mapHeight = newMaxY;
            return;
        }
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            if (!this.tileData || !this.tileData[y]) {
                log.error(`Cannot set tile at (${x}, ${y}): tileData is null or row ${y} doesn't exist`);
                return;
            }
            this.tileData[y][x] = tileId;
        }
    }

    /**
     * Blend chunk edges with neighboring chunks to ensure visual continuity.
     * When generating a new chunk, inspect neighboring chunks (if they exist)
     * and match terrain type along borders. Does NOT regenerate neighbor tiles,
     * only ensures edge continuity of the new chunk.
     */
    _blendChunkEdges(chunkCol, chunkRow, chunkData) {
        const cs = this.CHUNK_SIZE;
        const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];

        // Check each edge and blend with neighbor if it exists
        const edges = [
            { dir: 'N', neighborKey: `${chunkCol},${chunkRow - 1}`, edgeTiles: [] }, // Top edge
            { dir: 'S', neighborKey: `${chunkCol},${chunkRow + 1}`, edgeTiles: [] }, // Bottom edge
            { dir: 'W', neighborKey: `${chunkCol - 1},${chunkRow}`, edgeTiles: [] }, // Left edge
            { dir: 'E', neighborKey: `${chunkCol + 1},${chunkRow}`, edgeTiles: [] }  // Right edge
        ];

        for (const edge of edges) {
            const neighborChunk = this.chunkTiles.get(edge.neighborKey);
            if (!neighborChunk) continue; // No neighbor to blend with

            // Sample edge tiles from neighbor and match them in this chunk
            if (edge.dir === 'N') {
                // Top edge: match neighbor's bottom row
                for (let x = 0; x < cs; x++) {
                    const neighborTile = neighborChunk[(cs - 1) * cs + x]; // Bottom row of neighbor
                    chunkData[0 * cs + x] = neighborTile; // Top row of this chunk
                }
            } else if (edge.dir === 'S') {
                // Bottom edge: match neighbor's top row
                for (let x = 0; x < cs; x++) {
                    const neighborTile = neighborChunk[0 * cs + x]; // Top row of neighbor
                    chunkData[(cs - 1) * cs + x] = neighborTile; // Bottom row of this chunk
                }
            } else if (edge.dir === 'W') {
                // Left edge: match neighbor's right column
                for (let y = 0; y < cs; y++) {
                    const neighborTile = neighborChunk[y * cs + (cs - 1)]; // Right column of neighbor
                    chunkData[y * cs + 0] = neighborTile; // Left column of this chunk
                }
            } else if (edge.dir === 'E') {
                // Right edge: match neighbor's left column
                for (let y = 0; y < cs; y++) {
                    const neighborTile = neighborChunk[y * cs + 0]; // Left column of neighbor
                    chunkData[y * cs + (cs - 1)] = neighborTile; // Right column of this chunk
                }
            }
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
        // In chunk mode, only render tiles within allocated chunks.
        // mapStartX/Y are in tile units; may be negative when world expands left/north.
        const mapStartTileX = this.mapStartX || 0;
        const mapStartTileY = this.mapStartY || 0;
        let startCol = Math.max(mapStartTileX, Math.floor(bounds.left / this.tileSize));
        let endCol   = Math.min(this.mapWidth  - 1, Math.ceil(bounds.right  / this.tileSize));
        let startRow = Math.max(mapStartTileY, Math.floor(bounds.top    / this.tileSize));
        let endRow   = Math.min(this.mapHeight - 1, Math.ceil(bounds.bottom / this.tileSize));
        
        // Small overlap to prevent subpixel gaps between tiles.
        // Since we use a padded tileset, we can safely sample slightly beyond
        // the tile boundary - the padding contains the correct edge pixels.
        const overlap = 0.5;

        // Render base layer - only render tiles within allocated chunks
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // In chunk mode, only render if the chunk is allocated
                if (this.mapType === 'chunk') {
                    // Skip the great path zone — rendered separately by renderGreatPath()
                    const { mainPathY, mainPathGap } = CONFIG.chunks;
                    if (row >= mainPathY && row < mainPathY + mainPathGap) continue;
                    const chunkCol = Math.floor(col / this.CHUNK_SIZE);
                    // Adjust row to chunk-space for the key lookup
                    const adjRow = row >= mainPathY + mainPathGap ? row - mainPathGap : row;
                    const chunkRow = Math.floor(adjRow / this.CHUNK_SIZE);
                    const chunkKey = `${chunkCol},${chunkRow}`;
                    if (!this.chunkTiles.has(chunkKey)) {
                        // Skip unallocated chunks - don't render default grass beyond map bounds
                        continue;
                    }
                }
                
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

    /**
     * Render the great path strip — a 4-row separate tilemap spanning the full allocated width.
     * Rows: y=mainPathY (N-grass + S-border), y+1 and y+2 (path tiles), y+3 (S-grass + N-border).
     * Call this AFTER tilemap.render() so it draws over any virtual tile renders in the path zone.
     * Tree backgrounds (shadows/trunks) render after this — crowns/shadows from adjacent chunks
     * naturally render over this strip.
     */
    renderGreatPath(ctx, camera) {
        if (this.mapType !== 'chunk') return;
        const { mainPathY, mainPathGap } = CONFIG.chunks;
        const tileSize = this.tileSize;
        const bounds = camera.getVisibleBounds();
        const overlap = 0.5;

        const pathStartRow = mainPathY;               // 60
        const pathEndRow   = mainPathY + mainPathGap - 1; // 63

        if (bounds.bottom < pathStartRow * tileSize || bounds.top > (pathEndRow + 1) * tileSize) return;

        const startRow = Math.max(pathStartRow, Math.floor(bounds.top / tileSize));
        const endRow   = Math.min(pathEndRow,   Math.ceil(bounds.bottom / tileSize));
        const mapStartTileX = this.mapStartX || 0;
        const startCol = Math.max(mapStartTileX, Math.floor(bounds.left / tileSize));
        const endCol   = Math.min(this.mapWidth - 1, Math.ceil(bounds.right / tileSize));

        // Deterministic tile selection — same tile each frame, no flicker
        const getGrassTile = (x) => {
            const variants = [65, 66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
            return variants[((x * 2654435761) >>> 0) % variants.length];
        };
        const getPathTile = (x) => {
            const rare = [490, 491, 554, 555];
            return ((x * 1234567891) >>> 0) % 10 < 6 ? 482 : rare[((x * 987654321) >>> 0) % 4];
        };

        const drawTile = (tileId, worldX, worldY) => {
            const src = this.getTilesetSourceRectWithPadding(tileId, overlap);
            ctx.drawImage(
                this.tilesetImage,
                src.x, src.y, src.width, src.height,
                worldX - overlap, worldY - overlap,
                tileSize + overlap * 2, tileSize + overlap * 2
            );
        };

        // Crossing columns: town N-S connector enters at y=60 (N-grass), farm approach at y=63 (S-grass)
        const townCrossX = Math.floor(this.storeOffsetX / this.CHUNK_SIZE) * this.CHUNK_SIZE
                         + Math.floor(this.CHUNK_SIZE / 2); // 45
        const farmCrossX = this.newHouseOffsetX + this.newHouseWidth; // 38

        for (let row = startRow; row <= endRow; row++) {
            const rowOffset = row - mainPathY; // 0=N-grass, 1-2=path, 3=S-grass
            for (let col = startCol; col <= endCol; col++) {
                const worldX = col * tileSize;
                const worldY = row * tileSize;
                // Center rows are always path; outer grass rows become path only at their entry column:
                //   rowOffset=0 (y=60): town connector (x=45) enters from north
                //   rowOffset=3 (y=63): farm approach  (x=38) enters from south
                const isBridge = (rowOffset === 0 && col === townCrossX)
                               || (rowOffset === 3 && col === farmCrossX);
                if (rowOffset === 1 || rowOffset === 2 || isBridge) {
                    drawTile(getPathTile(col), worldX, worldY);
                } else {
                    // Grass row with inward-facing border overlay
                    drawTile(getGrassTile(col), worldX, worldY);
                    const overlayKey = rowOffset === 0 ? 'S' : 'N';
                    drawTile(CONFIG.tiles.pathEdgeOverlays[overlayKey], worldX, worldY);
                }
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

    // Returns true if the tile is occupied by a custom tilemap (e.g. house.tmx, home.tmx, store.tmx)
    isCustomTilemapTile(tileX, tileY) {
        if (this.newHouseWidth > 0 && this.newHouseHeight > 0) {
            if (tileX >= this.newHouseOffsetX && tileX < this.newHouseOffsetX + this.newHouseWidth &&
                tileY >= this.newHouseOffsetY && tileY < this.newHouseOffsetY + this.newHouseHeight) {
                return true;
            }
        }
        if (this.townHomeWidth > 0 && this.townHomeHeight > 0) {
            if (tileX >= this.townHomeOffsetX && tileX < this.townHomeOffsetX + this.townHomeWidth &&
                tileY >= this.townHomeOffsetY && tileY < this.townHomeOffsetY + this.townHomeHeight) {
                return true;
            }
        }
        if (this.storeWidth > 0 && this.storeHeight > 0) {
            if (tileX >= this.storeOffsetX && tileX < this.storeOffsetX + this.storeWidth &&
                tileY >= this.storeOffsetY && tileY < this.storeOffsetY + this.storeHeight) {
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
        if (this.mapType === 'chunk') {
            // Use new house position in chunk map
            return this.getNewHouseCenter();
        }
        const centerX = (this.houseOffsetX + this.houseWidth / 2) * this.tileSize;
        const centerY = (this.houseOffsetY + this.houseHeight / 2) * this.tileSize;
        return { x: centerX, y: centerY };
    }

    // Get the spawn/idle position: tile just above the new house door
    getPlayerSpawnPosition() {
        // Door is at local (1, 4) in house.tmx Roof layer.
        // One tile above the door = local (1, 3) = the indoor tile in front of the door.
        const spawnTileX = this.newHouseOffsetX + 1;
        const spawnTileY = this.newHouseOffsetY + 3;

        return {
            x: spawnTileX * this.tileSize + this.tileSize / 2,
            y: spawnTileY * this.tileSize + this.tileSize / 2,
            tileX: spawnTileX,
            tileY: spawnTileY
        };
    }

    getRandomTilePosition() {
        if (this.mapType === 'chunk') {
            // Farm chunk: col=1, row=2 → x=30-59, world y=64-93; grass below house starts at y=73
            const { farmCol, farmRow, mainPathGap } = CONFIG.chunks;
            const farmLeft = farmCol * this.CHUNK_SIZE;  // 30 (farm chunk start)
            const farmWidth = this.CHUNK_SIZE; // 30
            const grassStartY = this.newHouseOffsetY + this.newHouseHeight; // 67 + 6 = 73
            const farmChunkBottom = (farmRow + 1) * this.CHUNK_SIZE + mainPathGap; // 3*30+4 = 94
            const x = farmLeft + Math.floor(Math.random() * farmWidth);
            const y = grassStartY + Math.floor(Math.random() * (farmChunkBottom - grassStartY));
            return {
                x: x * this.tileSize + this.tileSize / 2,
                y: y * this.tileSize + this.tileSize / 2,
                tileX: x,
                tileY: y
            };
        }
        // Legacy: positions in the grass area (below the new house)
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

        if (this.mapType === 'chunk') {
            // Farm chunk bounds: col=1, row=2 → x=30-59, world y=64-93. Farmable area is below the house.
            const { farmCol } = CONFIG.chunks;
            const grassStartY = this.newHouseOffsetY + this.newHouseHeight; // 67 + 6 = 73
            const farmLeft = farmCol * this.CHUNK_SIZE;   // 30
            const farmRight = farmLeft + this.CHUNK_SIZE;  // 60
            return tileX >= farmLeft && tileX < farmRight && tileY >= grassStartY;
        }

        // CSV or other map types - not farmable
        return false;
    }

    /**
     * generateChunkMap — Sparse chunk-based world generation.
     *
     * ARCHITECTURAL OVERVIEW:
     * =======================
     * This system uses SPARSE chunk storage - only 3×4 chunks are allocated initially.
     * Chunks are stored in a Map: "col,row" → Uint16Array(900).
     * Unallocated chunks return default grass tile (65) when read.
     *
     * World layout (3 cols × 4 rows + 4-tile great path gap → 90×124 total):
     *   Town chunk: col=1, row=1 → x=30-59, world y=30-59
     *   Great path strip: world y=60-63 (separate renderer, not chunk tiles)
     *   Farm chunk: col=1, row=2 → x=30-59, world y=64-93
     *
     * Key positions (tile coordinates):
     *   Store (10×10):   x=34-43, y=35-44  (town chunk, centered)
     *   House (6×6):     x=32-37, world y=67-72 (farm chunk, 3-tile gap from corner)
     *   Player spawn:    (33, 70)            house.tmx local (1,3)
     *   Great path:      world y=60-63 (y=60 N-grass, y=61-62 path tiles, y=63 S-grass)
     */
    async generateChunkMap(tilesetPath) {
        try {
            // Set map type FIRST so setTileAt() knows we're in chunk mode
            this.mapType = 'chunk';
            
            // Load tileset image
            this.tilesetImage = await this.loadImage(tilesetPath);
            this.tilesPerRow = Math.floor(this.tilesetImage.width / this.paddedTileSize);

            // Load TMX files (store + house + home for town building)
            const [storeTmxResponse, houseTmxResponse, homeTmxResponse] = await Promise.all([
                fetch('Tileset/store.tmx'),
                fetch('Tileset/house.tmx'),
                fetch('Tileset/home.tmx')
            ]);
            const storeData = this.parseTmx(await storeTmxResponse.text());
            const houseData = this.parseTmx(await houseTmxResponse.text());
            const homeData  = this.parseTmx(await homeTmxResponse.text());

            // --- Map dimensions: 3×4 chunks + 4-tile great path gap = 90×124 tiles ---
            const { initialGridCols, initialGridRows, townCol, townRow, farmCol, farmRow, mainPathGap } = CONFIG.chunks;
            this.mapStartX = 0;                                               // left edge (tile units); may go negative on left-expansion
            this.mapStartY = 0;                                               // top edge (tile units); may go negative on north-expansion
            this.mapWidth  = initialGridCols * this.CHUNK_SIZE;               // 3 × 30 = 90
            this.mapHeight = initialGridRows * this.CHUNK_SIZE + mainPathGap;  // 4 × 30 + 4 = 124

            // --- Store placement in town chunk (col=1, row=1, x=30-59, y=30-59) ---
            this.storeWidth  = storeData.width;   // 10
            this.storeHeight = storeData.height;  // 10
            this.storeOffsetX = townCol * this.CHUNK_SIZE + 4;  // 30 + 4 = 34 (centered in chunk)
            this.storeOffsetY = townRow * this.CHUNK_SIZE + 5;  // 30 + 5 = 35

            // --- New house (house.tmx) in farm chunk (col=1, row=2, world x=30-59, world y=64-93) ---
            this.newHouseWidth  = houseData.width;  // 6
            this.newHouseHeight = houseData.height; // 6
            this.newHouseOffsetX = farmCol * this.CHUNK_SIZE + 2;              // 30 + 2 = 32
            this.newHouseOffsetY = farmRow * this.CHUNK_SIZE + mainPathGap + 3; // 60 + 4 + 3 = 67

            // --- Town home (home.tmx) in bottom-right of town chunk (col=1, row=1, x=30-59, y=30-59) ---
            // Place 10×10 building at x=48-57, y=47-56 (bottom-right quadrant, 2-tile margins)
            this.townHomeWidth  = homeData.width;   // 10
            this.townHomeHeight = homeData.height;  // 10
            this.townHomeOffsetX = townCol * this.CHUNK_SIZE + 18; // 30 + 18 = 48
            this.townHomeOffsetY = townRow * this.CHUNK_SIZE + 17; // 30 + 17 = 47

            // Alias so legacy code using houseOffsetY + houseHeight still works
            this.houseOffsetX = this.newHouseOffsetX;
            this.houseOffsetY = this.newHouseOffsetY;
            this.houseWidth   = this.newHouseWidth;
            this.houseHeight  = this.newHouseHeight;

            // --- Sparse tile storage: allocate ALL 3×4 chunks initially ---
            // This replaces the old 50,400-tile pre-allocation with 3,600 tiles (12 chunks).
            const commonGrassTiles = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
            const storeGroundLayer = storeData.tileLayers.find(l => l.name === 'Ground');
            const cs = this.CHUNK_SIZE; // 30

            this.chunkTiles = new Map();
            this.tileData   = null; // unused in chunk mode

            // Allocate all 3×4 chunks with random grass
            const fillChunkGrass = (col, row) => {
                const key = `${col},${row}`;
                const chunk = new Uint16Array(cs * cs);
                for (let i = 0; i < cs * cs; i++) {
                    chunk[i] = commonGrassTiles[Math.floor(Math.random() * commonGrassTiles.length)];
                }
                this.chunkTiles.set(key, chunk);
            };

            // Allocate all initial chunks
            for (let row = 0; row < initialGridRows; row++) {
                for (let col = 0; col < initialGridCols; col++) {
                    fillChunkGrass(col, row);
                }
            }

            // Composite store ground layer into the town chunk via setTileAt
            if (storeGroundLayer) {
                for (let ly = 0; ly < this.storeHeight; ly++) {
                    for (let lx = 0; lx < this.storeWidth; lx++) {
                        const tile = storeGroundLayer.data[ly][lx];
                        if (tile >= 0) {
                            this.setTileAt(this.storeOffsetX + lx, this.storeOffsetY + ly, tile);
                        }
                    }
                }
            }

            // Composite town home ground layer into the town chunk via setTileAt
            const homeGroundLayer = homeData.tileLayers.find(l => l.name === 'Ground');
            if (homeGroundLayer) {
                for (let ly = 0; ly < this.townHomeHeight; ly++) {
                    for (let lx = 0; lx < this.townHomeWidth; lx++) {
                        const tile = homeGroundLayer.data[ly][lx];
                        if (tile >= 0) {
                            this.setTileAt(this.townHomeOffsetX + lx, this.townHomeOffsetY + ly, tile);
                        }
                    }
                }
            }

            // --- Layers below character: store + town home Decor + Buildings (Base/Detail) ---
            this.layers = [];
            const addLayersFromTmx = (tmxData, offsetX, offsetY) => {
                const names = ['Decor', 'Buildings (Base)', 'Buildings (Detail)'];
                for (const name of names) {
                    const layer = tmxData.tileLayers.find(l => l.name === name);
                    if (layer) this.layers.push({ data: layer.data, offsetX, offsetY });
                }
            };
            addLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            addLayersFromTmx(homeData, this.townHomeOffsetX, this.townHomeOffsetY);

            // --- New house ground/floor layers (rendered AFTER path overlays) ---
            this.groundLayers = [];
            for (const name of ['Ground', 'Ground Detail', 'Wall', 'Wall Detail']) {
                const layer = houseData.tileLayers.find(l => l.name === name);
                if (layer) {
                    this.groundLayers.push({
                        data: layer.data,
                        offsetX: this.newHouseOffsetX,
                        offsetY: this.newHouseOffsetY
                    });
                }
            }

            // --- Layers above character: store + town home upper, house roof ---
            this.upperLayers = [];
            const addUpperLayersFromTmx = (tmxData, offsetX, offsetY) => {
                const layer = tmxData.tileLayers.find(l => l.name === 'Buildings (Upper)');
                if (layer) this.upperLayers.push({ data: layer.data, offsetX, offsetY });
            };
            addUpperLayersFromTmx(storeData, this.storeOffsetX, this.storeOffsetY);
            addUpperLayersFromTmx(homeData, this.townHomeOffsetX, this.townHomeOffsetY);

            this.roofLayers = [];
            for (const name of ['Roof', 'Roof Detail']) {
                const layer = houseData.tileLayers.find(l => l.name === name);
                if (layer) {
                    this.roofLayers.push({
                        data: layer.data,
                        offsetX: this.newHouseOffsetX,
                        offsetY: this.newHouseOffsetY
                    });
                }
            }

            // --- Collision rectangles ---
            this.collisionRects = [];

            for (const rect of storeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.storeOffsetX * this.tileSize,
                    y: rect.y + this.storeOffsetY * this.tileSize,
                    width: rect.width, height: rect.height
                });
            }

            for (const rect of homeData.collisionRects) {
                this.collisionRects.push({
                    x: rect.x + this.townHomeOffsetX * this.tileSize,
                    y: rect.y + this.townHomeOffsetY * this.tileSize,
                    width: rect.width, height: rect.height
                });
            }

            // New house: tile-based collision from Wall layer
            const houseWallLayer = houseData.tileLayers.find(l => l.name === 'Wall');
            if (houseWallLayer) {
                for (let localY = 0; localY < this.newHouseHeight; localY++) {
                    for (let localX = 0; localX < this.newHouseWidth; localX++) {
                        if (houseWallLayer.data[localY][localX] >= 0) {
                            this.collisionRects.push({
                                x: (this.newHouseOffsetX + localX) * this.tileSize,
                                y: (this.newHouseOffsetY + localY) * this.tileSize,
                                width: this.tileSize, height: this.tileSize
                            });
                        }
                    }
                }
            }

            // --- Interactables ---
            this.interactables = [];
            for (const interactable of storeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.storeOffsetX * this.tileSize,
                    y: interactable.y + this.storeOffsetY * this.tileSize,
                    width: interactable.width, height: interactable.height,
                    action: interactable.action
                });
            }
            for (const interactable of homeData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.townHomeOffsetX * this.tileSize,
                    y: interactable.y + this.townHomeOffsetY * this.tileSize,
                    width: interactable.width, height: interactable.height,
                    action: interactable.action
                });
            }
            for (const interactable of houseData.interactables) {
                this.interactables.push({
                    x: interactable.x + this.newHouseOffsetX * this.tileSize,
                    y: interactable.y + this.newHouseOffsetY * this.tileSize,
                    width: interactable.width, height: interactable.height,
                    action: interactable.action
                });
            }

            this.loaded = true;
            // mapType was already set at the start of this function
            log.debug(`Chunk map generated: ${this.mapWidth}×${this.mapHeight} tiles`);
            log.debug(`Store: ${this.storeWidth}×${this.storeHeight} at (${this.storeOffsetX},${this.storeOffsetY})`);
            log.debug(`Town home: ${this.townHomeWidth}×${this.townHomeHeight} at (${this.townHomeOffsetX},${this.townHomeOffsetY})`);
            log.debug(`New house: ${this.newHouseWidth}×${this.newHouseHeight} at (${this.newHouseOffsetX},${this.newHouseOffsetY})`);
        } catch (error) {
            log.error('Failed to generate chunk map:', error);
            throw error;
        }
    }

    // Get the center of the new house for camera positioning (used in chunk map mode)
    getNewHouseCenter() {
        const centerX = (this.newHouseOffsetX + this.newHouseWidth / 2) * this.tileSize;
        const centerY = (this.newHouseOffsetY + this.newHouseHeight / 2) * this.tileSize;
        return { x: centerX, y: centerY };
    }
}
