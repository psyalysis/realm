// ============================================================================
// TILE-BASED GRID ENGINE - MAIN ENTRY POINT
// ============================================================================

import { WORLD_WIDTH, WORLD_HEIGHT } from './client/config.js';
import { gameState } from './client/gameState.js';
import { generateMap, initEmptyMap, getMap } from './client/map.js';
import { initCamera, centerCameraOnRedSquare, updateTileSize as updateCameraTileSize } from './client/camera.js';
import { initRenderer, render, updateTileSize as updateRendererTileSize } from './client/renderer.js';
import { initAnimation, startAnimationLoop, updateTileSize as updateAnimationTileSize } from './client/animation.js';
import { initInput, handleKeyPress, handleKeyRelease, setMovementFunctions, queueMovementFromPressedKeys } from './client/input.js';
import { initPlayerManager } from './client/player.js';
import { initAbilities, updateGameRunningStatus, updateHealthBar, updateManaBar, updateNetworkState } from './client/abilities.js';
import { initNetwork, getNetworkState, updateTileSize as updateNetworkTileSize } from './client/network.js';
import { processNextMovement, executeMovement } from './client/movement.js';

// DOM Elements
let viewport, world, canvasGrid, redSquare, dashCooldownFill, healthFill, manaFill, manaCastBar, manaCastFill, playerHealthDots, damageOverlay, gameNotRunningMessage;
let ctx;
let tileSize = 0;

// Calculate tile size based on viewport
function calculateTileSize() {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    const tileSizeByWidth = viewportWidth / WORLD_WIDTH;
    const tileSizeByHeight = viewportHeight / WORLD_HEIGHT;
    
    let baseTileSize = Math.floor(Math.min(tileSizeByWidth, tileSizeByHeight));
    baseTileSize = Math.max(baseTileSize, 10);
    
    tileSize = baseTileSize * gameState.zoom;
    
    const dpr = window.devicePixelRatio || 1;
    // Setting width/height resets the canvas context, so we need to set it first
    canvasGrid.width = viewportWidth * dpr;
    canvasGrid.height = viewportHeight * dpr;
    canvasGrid.style.width = viewportWidth + 'px';
    canvasGrid.style.height = viewportHeight + 'px';
    // Scale context after setting dimensions (setting width/height resets context)
    if (ctx) {
        ctx.scale(dpr, dpr);
    }
    
    // Update all modules with new tile size
    updateCameraTileSize(tileSize);
    updateRendererTileSize(tileSize);
    updateAnimationTileSize(tileSize);
    updateNetworkTileSize(tileSize);
}

// Initialize game
function init() {
    viewport = document.getElementById('viewport');
    world = document.getElementById('world');
    canvasGrid = document.getElementById('canvasGrid');
    redSquare = document.getElementById('redSquare');
    dashCooldownFill = document.getElementById('dashCooldownFill');
    healthFill = document.getElementById('healthFill');
    manaFill = document.getElementById('manaFill');
    manaCastBar = document.getElementById('manaCastBar');
    manaCastFill = document.getElementById('manaCastFill');
    playerHealthDots = document.getElementById('playerHealthDots');
    damageOverlay = document.getElementById('damageOverlay');
    gameNotRunningMessage = document.getElementById('gameNotRunningMessage');
    
    if (!viewport || !world || !canvasGrid || !redSquare || !dashCooldownFill || !healthFill || !manaFill || !manaCastBar || !manaCastFill || !playerHealthDots || !damageOverlay || !gameNotRunningMessage) {
        console.error('Required DOM elements not found');
        return;
    }
    
    ctx = canvasGrid.getContext('2d');
    if (!ctx) {
        console.error('Failed to get 2D rendering context');
        return;
    }
    
    // Initialize modules
    calculateTileSize();
    
    // Initialize camera
    initCamera(viewport, tileSize);
    
    // Initialize renderer
    initRenderer({
        viewport,
        world,
        canvasGrid,
        redSquare,
        manaCastBar,
        manaCastFill,
        playerHealthDots,
        damageOverlay
    }, ctx, tileSize);
    
    // Initialize player manager
    initPlayerManager(world);
    
    // Initialize abilities
    initAbilities({
        dashCooldownFill,
        healthFill,
        manaFill,
        viewport,
        damageOverlay,
        gameNotRunningMessage
    }, { socket: null, isConnected: false, myPlayerId: null });
    
    // Initialize input
    initInput(viewport, { socket: null, isConnected: false });
    setMovementFunctions(executeMovement, processNextMovement);
    
    // Initialize network (will update abilities and input when connected)
    initNetwork({
        world,
        tileSize,
        redSquare,
        render
    });
    
    // Update network state in other modules
    const networkState = getNetworkState();
    updateNetworkState(networkState);
    initInput(viewport, networkState);
    
    // Generate initial map
    generateMap();
    
    if (!getMap() || getMap().length === 0) {
        console.warn('Map generation failed, initializing empty map');
        initEmptyMap();
    }
    
    centerCameraOnRedSquare();
    render();
    
    // Initialize interpolated positions
    gameState.playerInterpolated.x = gameState.player.x;
    gameState.playerInterpolated.y = gameState.player.y;
    gameState.playerTarget.x = gameState.player.x;
    gameState.playerTarget.y = gameState.player.y;
    gameState.cameraInterpolated.x = gameState.camera.x;
    gameState.cameraInterpolated.y = gameState.camera.y;
    gameState.cameraTarget.x = gameState.camera.x;
    gameState.cameraTarget.y = gameState.camera.y;
    
    // Initialize animation with callbacks
    initAnimation(viewport, tileSize, {
        processNextMovement,
        queueMovementFromPressedKeys,
        render
    });
    
    // Initialize UI
    updateHealthBar(gameState.health);
    updateManaBar();
    updateGameRunningStatus();
    
    // Start animation loop
    startAnimationLoop();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        calculateTileSize();
        render();
    });
    
    // Handle keyboard input
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyRelease);
    
    // Focus viewport when clicking on game area
    viewport.addEventListener('click', (event) => {
        const target = event.target;
        if (target === viewport || target === canvasGrid || target === world || target === redSquare) {
            if (!(target instanceof HTMLInputElement || 
                  target instanceof HTMLTextAreaElement ||
                  target instanceof HTMLSelectElement ||
                  target.isContentEditable)) {
                viewport.focus();
            }
        }
    });
    
    viewport.setAttribute('tabindex', '0');
    
    console.log('Tile engine initialized');
    console.log('World size:', WORLD_WIDTH, 'x', WORLD_HEIGHT);
    console.log('Tile size:', tileSize, 'px');
}

// Start initialization
console.log('Script loading, document readyState:', document.readyState);

if (document.readyState === 'loading') {
    console.log('Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired, calling init');
        init();
    });
} else {
    console.log('Document already loaded, calling init immediately');
    init();
}

window.addEventListener('focus', () => {
    console.log('Window gained focus');
});

window.addEventListener('blur', () => {
    console.log('Window lost focus');
});

