import { Game } from './Game.js';
import { CharacterCustomizer } from './CharacterCustomizer.js';

// Entry point
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const game = new Game('gameCanvas');
        await game.init();
        game.start();

        // Initialize character customization UI
        new CharacterCustomizer(game);
    } catch (error) {
        console.error('Failed to start game:', error);
        document.body.innerHTML = `
            <div style="color: white; padding: 20px; font-family: Arial, sans-serif;">
                <h1>Failed to load game</h1>
                <p>Error: ${error.message}</p>
                <p>Please check the console for more details.</p>
            </div>
        `;
    }
});
