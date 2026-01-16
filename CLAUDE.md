# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarmGame is a browser-based 2D farming simulation game built with vanilla JavaScript and HTML5 Canvas. No build system, frameworks, or external dependencies.

## Running the Game

Open `index.html` directly in a web browser. No build step required. Refresh browser to see code changes.

## Architecture

### Core Systems (js/)

- **Game.js** - Main engine class. Manages game loop (update/render via requestAnimationFrame), initializes all subsystems, handles character loading and movement
- **Camera.js** - Pan/zoom camera with world-to-screen coordinate conversion. Zoom range: 0.5x-4x
- **InputManager.js** - Unified input handling for keyboard (WASD/arrows), mouse (drag/wheel/click), and touch (drag/pinch/tap). Supports drag callbacks and panning toggle
- **TilemapRenderer.js** - Loads CSV tilemap and renders visible tiles from tileset PNG (16px tiles, 64x64 grid = 4096 tiles). Supports runtime tile modification via setTileAt()
- **SpriteAnimator.js** - Horizontal strip sprite animation with configurable FPS (default 8 FPS). Supports non-looping animations with completion callbacks
- **CropManager.js** / **Crop.js** - Crop lifecycle: 5 growth stages (3 seconds each), harvest with floating "+1" feedback, post-harvest decay effects
- **CharacterCustomizer.js** - UI panel for hair style and animation selection

### Tool & Job Systems (js/)

- **Toolbar.js** - Bottom toolbar with tool icons extracted from tileset at 400% scale. Handles tool selection and cursor changes
- **TileSelector.js** - Click/drag tile selection with rectangle highlight. Validates tiles against tool acceptability rules
- **JobManager.js** - Job queue for character tasks. Coordinates walk → animate → apply effect → next tile sequence
- **Pathfinder.js** - A* pathfinding algorithm. Finds paths avoiding obstacles (water, rocks)
- **TileOverlayManager.js** - Manages sprite overlays on tiles (holes from digging)

### Rendering Order
1. Canvas clear → 2. Tilemap → 3. Tile overlays → 4. Crops → 5. Tile selection highlight → 6. Characters → 7. Effects

### Coordinate Systems
- World coordinates (pixels) ↔ Tile coordinates (grid positions) ↔ Screen coordinates (canvas viewport)
- Camera class provides conversion methods

## Asset Structure

- **Characters/Human/** - Player character with 3 layers: `base_[anim].png`, `[style]hair_[anim].png`, `tools_[anim].png`. 6 hair styles, 20 animations
- **Characters/Skeleton/, Goblin/** - Pre-made NPCs
- **Elements/Crops/** - Crop growth stage sprites
- **Tileset/** - `spr_tileset_sunnysideworld_16px.png` (1024x1024), `testing.csv` (tilemap data)
- **UI/** - Interface elements

## Configuration Constants

**Game.js ANIMATION_DATA** - Frame counts per animation (e.g., WAITING: 9, WALKING: 8, HAMMERING: 23)

**Crop.js** - Growth timing (GROWTH_TIME: 3000ms), crop types (11 types with tile offsets), tile ID ranges (691-1139)

**Camera.js** - Zoom limits (0.5-4x), pan speed (300px/sec)

## Known Asset Quirks

Animation filenames have inconsistencies the code handles:
- "HAMMERING" → filename uses "hamering" (typo in assets)
- "WALKING" → filename uses "walk" (shortened)

## Tool System

**Available tools** (Toolbar.js TOOLS constant):
- Watering Can (2858), Axe (2922), Hoe (2986), Sword (3050)
- Shovel (3114), Fishing Rod (3178), Pickaxe (3113), Plant (2857)

**Implemented tool actions**:
- **Hoe**: Changes grass/dirt tiles to hoed ground (tile ID 67). Uses AXE animation
- **Shovel**: Only works on hoed tiles (67). Adds hole overlay (tile ID 1138). Uses DIG animation

**Character behavior**: Character walks to an adjacent tile, faces the work tile, then performs the tool animation. Sprite flips horizontally when facing left.

**Adding a new tool action**: In JobManager.js applyToolEffect(), add case for tool.id

**Acceptable tiles**: Defined in TileSelector.js ACCEPTABLE_TILES object per tool

## Extending the Game

**New crop type**: Add to CROP_TYPES in Crop.js with index, assign tile ID in TILE_BASE

**New animation**: Add frame count to ANIMATION_DATA in Game.js, create sprite files, add button to HTML

**New NPC**: Create SpriteAnimator in Game.createCharacters(), load sprite, push to this.characters array

**Modify tilemap**: Edit testing.csv (comma-separated tile IDs), refresh browser

**New tool**: Add to TOOLS in Toolbar.js, add acceptable tiles in TileSelector.js, add action in JobManager.js
