import { mount } from 'svelte';
import App from './ui/App.svelte';
import { startGame } from './game/main';
import { gamePaused } from './ui/stores';

mount(App, { target: document.getElementById('ui')! });

gamePaused.subscribe((paused) => {
    if (!paused) startGame();
});
