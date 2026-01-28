// Job Queue UI Panel - displays queued jobs for all workers

export class JobQueueUI {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.isExpanded = true;

        this.createContainer();

        // Subscribe to queue changes
        if (this.game.jobManager) {
            this.game.jobManager.onQueueChange = () => this.render();
        }

        // Initial render
        this.render();
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'job-queue-panel';
        this.container.innerHTML = `
            <div class="job-queue-header">
                <span>Job Queue</span>
                <button class="collapse-btn">-</button>
            </div>
            <div class="job-queue-content">
                <div class="queue-section" data-queue="human">
                    <div class="queue-title">Human</div>
                    <div class="queue-jobs"></div>
                </div>
                <div class="queue-section" data-queue="goblin">
                    <div class="queue-title">Goblin</div>
                    <div class="queue-jobs"></div>
                </div>
                <div class="queue-section" data-queue="all">
                    <div class="queue-title">Shared</div>
                    <div class="queue-jobs"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Collapse toggle
        this.container.querySelector('.collapse-btn').addEventListener('click', () => {
            this.isExpanded = !this.isExpanded;
            this.container.classList.toggle('collapsed', !this.isExpanded);
            this.container.querySelector('.collapse-btn').textContent = this.isExpanded ? '-' : '+';
        });
    }

    render() {
        if (!this.game.jobManager) return;

        const jobsByQueue = this.game.jobManager.getAllJobsByQueue();

        for (const queueName of ['human', 'goblin', 'all']) {
            const section = this.container.querySelector(`[data-queue="${queueName}"] .queue-jobs`);
            if (!section) continue;

            const queueData = jobsByQueue[queueName];
            section.innerHTML = '';

            // Add active job first (if any)
            if (queueData.active) {
                section.appendChild(this.createJobElement(queueData.active, true));
            }

            // Add queued jobs
            for (const job of queueData.queued) {
                section.appendChild(this.createJobElement(job, false));
            }

            // Show "No jobs" if empty
            if (!queueData.active && queueData.queued.length === 0) {
                const noJobs = document.createElement('div');
                noJobs.className = 'no-jobs';
                noJobs.textContent = 'No jobs';
                section.appendChild(noJobs);
            }
        }
    }

    createJobElement(job, isActive) {
        const el = document.createElement('div');
        el.className = `job-item ${isActive ? 'active' : ''}`;

        const remaining = job.tiles ? (job.tiles.length - job.currentTileIndex) : 0;
        const statusText = isActive ? this.getStatusText(job.status) : 'Queued';

        el.innerHTML = `
            <div class="job-icon" style="background-position: ${this.getTilePosition(job.tool.tileId)}"></div>
            <div class="job-info">
                <div class="job-name">${job.tool.name}</div>
                <div class="job-status">${statusText} (${remaining} tiles)</div>
            </div>
            <button class="job-cancel" data-job-id="${job.id}" title="Cancel job">&times;</button>
        `;

        el.querySelector('.job-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            this.game.jobManager.cancelJob(job.id);
        });

        return el;
    }

    getStatusText(status) {
        switch (status) {
            case 'walking': return 'Walking';
            case 'working': return 'Working';
            case 'paused': return 'Paused';
            default: return status;
        }
    }

    getTilePosition(tileId) {
        const tilesPerRow = 64;
        const col = tileId % tilesPerRow;
        const row = Math.floor(tileId / tilesPerRow);
        return `-${col * 16}px -${row * 16}px`;
    }
}
