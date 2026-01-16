export class CharacterCustomizer {
    constructor(game) {
        this.game = game;
        this.menuOpen = false;

        this.customizeBtn = document.getElementById('customize-btn');
        this.customizeMenu = document.getElementById('customize-menu');
        this.hairOptions = document.getElementById('hair-options');
        this.animOptions = document.getElementById('anim-options');

        this.init();
    }

    init() {
        // Toggle menu on button click
        this.customizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.menuOpen && !this.customizeMenu.contains(e.target)) {
                this.closeMenu();
            }
        });

        // Prevent menu clicks from closing it
        this.customizeMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Hair style buttons
        this.hairOptions.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', () => this.onHairClick(btn));
        });

        // Animation buttons
        this.animOptions.querySelectorAll('.anim-btn').forEach(btn => {
            btn.addEventListener('click', () => this.onAnimClick(btn));
        });
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        this.customizeMenu.classList.toggle('open', this.menuOpen);
    }

    closeMenu() {
        this.menuOpen = false;
        this.customizeMenu.classList.remove('open');
    }

    async onHairClick(btn) {
        const hairStyle = btn.dataset.hair;

        // Update active state
        this.hairOptions.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update game
        await this.game.setHairStyle(hairStyle);
    }

    async onAnimClick(btn) {
        const animation = btn.dataset.anim;

        // Update active state
        this.animOptions.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update game
        await this.game.setAnimation(animation);
    }
}
