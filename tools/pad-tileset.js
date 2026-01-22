/**
 * Tileset Padding Tool
 *
 * This tool adds padding (extrusion) around each tile in a tileset to prevent
 * texture bleeding/seam artifacts when rendering at non-integer zoom levels.
 *
 * Usage: node tools/pad-tileset.js <input-tileset> <output-tileset> [tile-size] [padding]
 *
 * Example: node tools/pad-tileset.js Tileset/spr_tileset.png Tileset/spr_tileset_padded.png 16 1
 *
 * The tool duplicates the edge pixels of each tile into the padding area,
 * so when the GPU samples beyond tile boundaries, it gets the same color.
 */

const fs = require('fs');
const path = require('path');

// Check if we're running in Node.js with canvas support
let createCanvas, loadImage;
try {
    const canvas = require('canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
} catch (e) {
    console.error('This tool requires the "canvas" npm package.');
    console.error('Install it with: npm install canvas');
    console.error('\nAlternatively, you can use the browser-based version:');
    console.error('Open tools/pad-tileset.html in your browser.');
    process.exit(1);
}

async function padTileset(inputPath, outputPath, tileSize = 16, padding = 1) {
    console.log(`Loading tileset: ${inputPath}`);
    const image = await loadImage(inputPath);

    const srcWidth = image.width;
    const srcHeight = image.height;
    const tilesX = Math.floor(srcWidth / tileSize);
    const tilesY = Math.floor(srcHeight / tileSize);

    console.log(`Source tileset: ${srcWidth}x${srcHeight} (${tilesX}x${tilesY} tiles)`);

    // Calculate new dimensions with padding
    const newTileSize = tileSize + padding * 2;
    const newWidth = tilesX * newTileSize;
    const newHeight = tilesY * newTileSize;

    console.log(`Output tileset: ${newWidth}x${newHeight} (tile size: ${newTileSize}px with ${padding}px padding)`);

    // Create output canvas
    const canvas = createCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // Disable smoothing
    ctx.imageSmoothingEnabled = false;

    // Process each tile
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const srcX = tx * tileSize;
            const srcY = ty * tileSize;
            const dstX = tx * newTileSize + padding;
            const dstY = ty * newTileSize + padding;

            // Draw the main tile
            ctx.drawImage(image, srcX, srcY, tileSize, tileSize, dstX, dstY, tileSize, tileSize);

            // Extrude edges by duplicating edge pixels into padding

            // Top edge (1px row stretched into top padding)
            ctx.drawImage(image, srcX, srcY, tileSize, 1, dstX, dstY - padding, tileSize, padding);

            // Bottom edge
            ctx.drawImage(image, srcX, srcY + tileSize - 1, tileSize, 1, dstX, dstY + tileSize, tileSize, padding);

            // Left edge
            ctx.drawImage(image, srcX, srcY, 1, tileSize, dstX - padding, dstY, padding, tileSize);

            // Right edge
            ctx.drawImage(image, srcX + tileSize - 1, srcY, 1, tileSize, dstX + tileSize, dstY, padding, tileSize);

            // Corners (duplicate corner pixels)
            // Top-left
            ctx.drawImage(image, srcX, srcY, 1, 1, dstX - padding, dstY - padding, padding, padding);

            // Top-right
            ctx.drawImage(image, srcX + tileSize - 1, srcY, 1, 1, dstX + tileSize, dstY - padding, padding, padding);

            // Bottom-left
            ctx.drawImage(image, srcX, srcY + tileSize - 1, 1, 1, dstX - padding, dstY + tileSize, padding, padding);

            // Bottom-right
            ctx.drawImage(image, srcX + tileSize - 1, srcY + tileSize - 1, 1, 1, dstX + tileSize, dstY + tileSize, padding, padding);
        }
    }

    // Save the output
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    console.log(`Padded tileset saved to: ${outputPath}`);
    console.log(`\nTo use this tileset, update your TilemapRenderer with:`);
    console.log(`  - tileSize: ${tileSize}`);
    console.log(`  - paddedTileSize: ${newTileSize}`);
    console.log(`  - padding: ${padding}`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: node pad-tileset.js <input-tileset> <output-tileset> [tile-size] [padding]');
    console.log('');
    console.log('Arguments:');
    console.log('  input-tileset   Path to the source tileset PNG');
    console.log('  output-tileset  Path for the output padded tileset PNG');
    console.log('  tile-size       Size of each tile in pixels (default: 16)');
    console.log('  padding         Padding to add around each tile (default: 1)');
    console.log('');
    console.log('Example:');
    console.log('  node pad-tileset.js Tileset/spr_tileset.png Tileset/spr_tileset_padded.png 16 1');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];
const tileSize = parseInt(args[2]) || 16;
const padding = parseInt(args[3]) || 1;

padTileset(inputPath, outputPath, tileSize, padding).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
