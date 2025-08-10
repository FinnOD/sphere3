<script lang="ts">
    import { gamePaused } from './stores';
    import { getPlayer } from '../game/main';

    let paused = $state(true);
    let instructionsVisible = $state(true);

    function start() {
        paused = false;
        gamePaused.set(false);

        // Small delay to ensure game is initialized
        setTimeout(() => {
            const player = getPlayer();
            if (player) {
                // Set up pointer lock event listeners
                player.onLock(() => {
                    instructionsVisible = false;
                });

                player.onUnlock(() => {
                    paused = true;
                    gamePaused.set(true);
                    instructionsVisible = true;
                });

                // Lock the pointer
                player.lock();
            }
        }, 100);
    }
</script>

{#if paused}
    <div class="menu">
        <h1>My Game</h1>
        {#if instructionsVisible}
            <div class="instructions">
                <p>Move: WASD</p>
                <p>Look: Mouse</p>
                <p>Jump: Space</p>
                <p>Pause: Escape</p>
            </div>
        {/if}
        <button onclick={start}>Start</button>
    </div>
{/if}

<style>
    .menu {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 1rem;
    }

    .instructions {
        text-align: center;
        opacity: 0.8;
    }

    .instructions p {
        margin: 0.2rem 0;
    }

    button {
        padding: 0.5rem 1rem;
        font-size: 1.1rem;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
    }

    button:hover {
        background: #005999;
    }
</style>
