// ============================================================================
// TILE-BASED GRID ENGINE
// ============================================================================

// World Configuration
const WORLD_WIDTH = 50;  // Grid tiles wide
const WORLD_HEIGHT = 50; // Grid tiles tall

// Input Mapping
const INPUT_MAP = {
    'w': 'MOVE_UP',
    's': 'MOVE_DOWN',
    'a': 'MOVE_LEFT',
    'd': 'MOVE_RIGHT'
};

// Map Data Structure - 2D array to store wall positions (true = wall, false = empty)
let map = [];

// Game State - All positions in grid coordinates
const gameState = {
    player: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
    playerTarget: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) }, // Target position for smooth movement
    playerInterpolated: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) }, // Current interpolated position
    camera: { x: 0, y: 0 }, // Camera position in grid coordinates
    cameraTarget: { x: 0, y: 0 }, // Target camera position for smooth following
    cameraInterpolated: { x: 0, y: 0 }, // Current interpolated camera position
    cameraArrivalTime: 1, // Camera arrival time (can be overridden for effects, default matches CAMERA_ARRIVAL_TIME)
    isHitEffectActive: false, // Flag to prevent camera reset during hit effects
    zoom: 4.0, // 3x zoom
    movementQueue: [], // Queue of pending movement actions
    lastMovementDirection: null, // Track last movement direction for squash/stretch
    wobbleStartTime: null, // Track when wobble effect should start
    pressedKeys: new Set(), // Track which keys are currently being held down
    dashCooldownEndTime: 0, // Timestamp when dash cooldown ends (0 = ready)
    isDashing: false, // Track if player is currently dashing
    health: 3, // Player health points (max 3)
    maxHealth: 3, // Maximum health points
    manaCooldownEndTime: 0, // Timestamp when mana cooldown ends (0 = ready)
    isCastingMana: false, // Track if player is currently casting mana ability
    manaCastEndTime: 0 // Timestamp when mana cast completes
};

// Animation Configuration
const BASE_ANIMATION_SPEED = 2; // Tiles per second
const CAMERA_ARRIVAL_TIME = 1; // Camera should arrive at target within this time (seconds)
const TRANSITION_THRESHOLD = 0.025; // Start next move at 85% completion (0.15 of 1.0 tile remaining)

// Dash Configuration
const DASH_DISTANCE = 4; // Number of blocks to dash
const DASH_COOLDOWN = 2.0; // Cooldown in seconds
const DASH_SPEED = 8; // Tiles per second (faster than normal movement)

// Mana Configuration
const MANA_COOLDOWN = 7.0; // Cooldown in seconds
const MANA_CAST_TIME = 0.7; // Time player is stopped while casting (seconds)

// Grid Configuration
const GRID_OPACITY = 0.1; // Grid line opacity (0.0 to 1.0)
const GRID_THICKNESS = 1.25; // Grid line thickness in pixels
const WALL_CORNER_RADIUS = 8; // Wall corner radius in pixels
const BACKGROUND_COLOR = '#ffffff'; // Background color (white)
const PLAYER_GLOW_RADIUS = 3; // Player glow radius in cells

// Map Generation Configuration
const MAP_CENTER_X = WORLD_WIDTH / 2;
const MAP_CENTER_Y = WORLD_HEIGHT / 2;
const MAX_DISTANCE_FROM_CENTER = Math.sqrt(MAP_CENTER_X * MAP_CENTER_X + MAP_CENTER_Y * MAP_CENTER_Y);
const WALL_CLUMP_BASE_PROBABILITY = 0.02; // Base probability of starting a wall clump
const WALL_CLUMP_MAX_PROBABILITY = 0.15; // Maximum probability at edge
const WALL_CLUMP_SIZE_MIN = 3; // Minimum clump size
const WALL_CLUMP_SIZE_MAX = 8; // Maximum clump size
const WALL_CLUMP_SPREAD_CHANCE = 0.4; // Chance for clump to spread to adjacent cell

// Player Configuration
const PLAYER_SIZE = 0.85; // Player size relative to cell (1.0 = full cell size)
const SQUASH_STRETCH_INTENSITY = 0.7; // Intensity of squash and stretch animation (0.0 to 1.0)
const JELLY_WOBBLE_INTENSITY = 0.07; // Intensity of jelly wobble when arriving at destination (0.0 to 1.0)
const JELLY_WOBBLE_FREQUENCY = 3.5; // Frequency of jelly wobble oscillation (cycles per second)
const JELLY_WOBBLE_DURATION = 0.4; // Duration of wobble effect in seconds

// DOM Elements
let viewport, world, canvasGrid, redSquare, dashCooldownFill, healthFill, manaFill, manaCastBar, manaCastFill, playerHealthDots, damageOverlay, gameNotRunningMessage;
let ctx; // Canvas 2D rendering context
let tileSize = 0; // Calculated dynamically
let animationFrameId = null; // Animation frame ID for requestAnimationFrame
let lastFrameTime = performance.now(); // For frame-rate independent movement
let previousHealth = 3; // Track previous health to detect damage

// Performance optimization: Track last values to avoid unnecessary updates
let lastDashCooldownFill = -1; // Track last dash cooldown fill percentage
let lastHealthFill = -1; // Track last health fill percentage
let lastManaFill = -1; // Track last mana fill percentage
let lastCameraX = -Infinity; // Track last camera X position for map redraw optimization
let lastCameraY = -Infinity; // Track last camera Y position for map redraw optimization
let lastCameraZoom = -1; // Track last zoom level for map redraw optimization
let lastTileSize = 0; // Track last tile size for map redraw optimization

// Performance optimization: Track last player render values to avoid unnecessary DOM updates
let lastPlayerRender = {
    width: -1,
    height: -1,
    left: -1,
    top: -1,
    transform: ''
};

// ============================================================================
// MULTIPLAYER NETWORKING
// ============================================================================

let socket = null;
let isConnected = false;
let myPlayerId = null;
let otherPlayers = new Map(); // playerId -> player data
let mapSeed = null; // Map seed from server
let serverTimeOffset = 0; // Offset to sync server time with client time

// Initialize socket connection
function initMultiplayer() {
    // Try to connect to server (fallback to localhost if same origin)
    const serverUrl = window.location.origin;
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        isConnected = true;
        updateGameRunningStatus();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        updateGameRunningStatus();
    });
    
    // Check connection status after a short delay (in case server is slow to respond)
    setTimeout(() => {
        updateGameRunningStatus();
    }, 1000);
    
    // Receive initial game state
    socket.on('gameState', (data) => {
        console.log('Received game state:', data);
        myPlayerId = data.playerId;
        mapSeed = data.mapSeed;
        updateGameRunningStatus(); // Hide message when game state received
        
        // Calculate server time offset (server uses Date.now(), client uses performance.now())
        const serverTime = Date.now() / 1000;
        const clientTime = performance.now() / 1000;
        // We'll sync when we receive timestamps - for now use a simple offset
        // The offset will be calculated based on received timestamps
        
        // Update local player state
        gameState.player.x = data.player.x;
        gameState.player.y = data.player.y;
        gameState.playerTarget.x = data.player.targetX;
        gameState.playerTarget.y = data.player.targetY;
        gameState.playerInterpolated.x = data.player.x;
        gameState.playerInterpolated.y = data.player.y;
        previousHealth = data.player.health; // Initialize previous health
        gameState.health = data.player.health;
        gameState.maxHealth = data.player.maxHealth;
        
        // Set local player color from server
        if (data.player.color && redSquare) {
            gameState.playerColor = data.player.color;
            redSquare.style.backgroundColor = data.player.color;
        }
        
        // Convert server timestamps to client-relative time
        const now = performance.now() / 1000;
        if (data.player.dashCooldownEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilDash = data.player.dashCooldownEndTime - serverNow;
            gameState.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
        } else {
            gameState.dashCooldownEndTime = 0;
        }
        
        if (data.player.manaCooldownEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilMana = data.player.manaCooldownEndTime - serverNow;
            gameState.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        } else {
            gameState.manaCooldownEndTime = 0;
        }
        
        gameState.isDashing = data.player.isDashing;
        gameState.isCastingMana = data.player.isCastingMana;
        
        if (data.player.manaCastEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilCastComplete = data.player.manaCastEndTime - serverNow;
            gameState.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
        } else {
            gameState.manaCastEndTime = 0;
        }
        
        // Generate map with seed
        generateMapFromSeed(mapSeed);
        
        // Ensure map is properly initialized after regeneration
        if (!map || map.length === 0) {
            console.warn('Map regeneration failed, initializing empty map');
            map = [];
            for (let y = 0; y < WORLD_HEIGHT; y++) {
                map[y] = [];
                for (let x = 0; x < WORLD_WIDTH; x++) {
                    map[y][x] = false;
                }
            }
        }
        
        // Add other players
        for (const playerData of data.otherPlayers) {
            addOtherPlayer(playerData);
        }
        
        // Update UI
        updateHealthBar();
        updateManaBar();
        centerCameraOnRedSquare();
        
        // Force render after map regeneration to prevent grey screen
        render();
    });
    
    // Receive game state updates (delta compressed)
    socket.on('gameStateUpdate', (data) => {
        // Update other players (only changed data is sent)
        for (const playerData of data.players) {
            updateOtherPlayer(playerData);
        }
    });
    
    // Player joined
    socket.on('playerJoined', (playerData) => {
        console.log('Player joined:', playerData.id);
        addOtherPlayer(playerData);
    });
    
    // Player left
    socket.on('playerLeft', (data) => {
        console.log('Player left:', data.id);
        removeOtherPlayer(data.id);
    });
    
    // Movement confirmation
    socket.on('moveConfirmed', (data) => {
        // Server confirmed movement - smooth reconciliation instead of snapping
        const diffX = Math.abs(gameState.player.x - data.x);
        const diffY = Math.abs(gameState.player.y - data.y);
        
        if (diffX > 0.1 || diffY > 0.1) {
            // Position differs significantly - smooth correction
            // Don't snap immediately, let interpolation handle it smoothly
            gameState.player.x = data.x;
            gameState.player.y = data.y;
            gameState.playerTarget.x = data.targetX;
            gameState.playerTarget.y = data.targetY;
            // Don't snap interpolated position - let it interpolate smoothly
            // This prevents visual jitter when network is laggy
        } else {
            // Close enough, just sync target
            gameState.playerTarget.x = data.targetX;
            gameState.playerTarget.y = data.targetY;
        }
        
        // Update camera to follow player (only if hit effect isn't active)
        if (!gameState.isHitEffectActive) {
            centerCameraOnRedSquare();
        }
    });
    
    // Movement rejection - server rejected the move, snap back to valid position
    socket.on('moveRejected', (data) => {
        // Server rejected movement - snap back to valid position immediately
        // This prevents any visual wall penetration
        gameState.player.x = data.x;
        gameState.player.y = data.y;
        gameState.playerTarget.x = data.targetX;
        gameState.playerTarget.y = data.targetY;
        gameState.playerInterpolated.x = data.x;
        gameState.playerInterpolated.y = data.y;
        // Clear movement queue to prevent stuck state
        gameState.movementQueue = [];
        
        // Don't reset camera if collision happened (collision event will handle camera effect)
        // Only reset camera if it wasn't a player collision
        if (data.reason !== 'blocked_by_player') {
            centerCameraOnRedSquare();
        }
        
        // Validate position is not in a wall (safety check)
        if (isWall(gameState.player.x, gameState.player.y)) {
            console.warn('Server sent invalid position in moveRejected, correcting...');
            // Find nearest valid position
            const validPos = findNearestValidPosition(gameState.player.x, gameState.player.y);
            gameState.player.x = validPos.x;
            gameState.player.y = validPos.y;
            gameState.playerTarget.x = validPos.x;
            gameState.playerTarget.y = validPos.y;
            gameState.playerInterpolated.x = validPos.x;
            gameState.playerInterpolated.y = validPos.y;
        }
    });
    
    // Other player moved
    socket.on('playerMoved', (data) => {
        updateOtherPlayerPosition(data.id, data.x, data.y, data.targetX, data.targetY);
    });
    
    // Dash confirmation
    socket.on('dashConfirmed', (data) => {
        // Update server-authoritative position
        gameState.player.x = data.x;
        gameState.player.y = data.y;
        gameState.playerTarget.x = data.targetX;
        gameState.playerTarget.y = data.targetY;
        // Don't snap interpolated position - let it smoothly catch up if there's a difference
        // This preserves smooth movement even if server position differs slightly
        
        // Convert server timestamp to client-relative time
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        if (data.dashCooldownEndTime > 0) {
            const timeUntilDash = data.dashCooldownEndTime - serverNow;
            gameState.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
        } else {
            gameState.dashCooldownEndTime = 0;
        }
    });
    
    // Other player dashed
    socket.on('playerDashed', (data) => {
        updateOtherPlayerPosition(data.id, data.x, data.y, data.targetX, data.targetY);
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.dashCooldownEndTime = data.dashCooldownEndTime;
        }
    });
    
    // Mana confirmation
    socket.on('manaConfirmed', (data) => {
        // Convert server timestamps to client-relative time
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        
        if (data.manaCooldownEndTime > 0) {
            const timeUntilMana = data.manaCooldownEndTime - serverNow;
            gameState.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        } else {
            gameState.manaCooldownEndTime = 0;
        }
        
        if (data.manaCastEndTime > 0) {
            const timeUntilCastComplete = data.manaCastEndTime - serverNow;
            gameState.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
        } else {
            gameState.manaCastEndTime = 0;
        }
        
        gameState.isCastingMana = data.isCastingMana;
    });
    
    // Other player used mana
    socket.on('playerMana', (data) => {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.manaCooldownEndTime = data.manaCooldownEndTime;
            // Convert server timestamp to client-relative time
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            if (data.manaCastEndTime > 0) {
                const timeUntilCastComplete = data.manaCastEndTime - serverNow;
                otherPlayer.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
            } else {
                otherPlayer.manaCastEndTime = 0;
            }
            otherPlayer.isCastingMana = data.isCastingMana;
        }
    });
    
    // Health update
    socket.on('playerHealthChanged', (data) => {
        // Check if this is the local player taking damage
        if (data.id === myPlayerId) {
            // Preserve previous health before updating to ensure damage effect triggers
            const oldHealth = gameState.health;
            gameState.health = data.health;
            // Only update previousHealth if health actually changed (avoid race conditions with playerHit)
            if (oldHealth !== data.health) {
                previousHealth = oldHealth;
                updateHealthBar();
            }
        } else {
            // Update other player's health
            const otherPlayer = otherPlayers.get(data.id);
            if (otherPlayer) {
                otherPlayer.health = data.health;
                // Force health dots update for other players
                forceUpdateHealthDots(otherPlayer);
            }
        }
    });
    
    // Unified player hit event - handles all hit/damage visual feedback
    socket.on('playerHit', (data) => {
        const isAttacker = data.attackerId === myPlayerId;
        const isTarget = data.targetId === myPlayerId;
        
        if (isAttacker) {
            // You hit someone - camera bump toward enemy
            triggerHitCameraEffect(data.targetX, data.targetY, false);
            // Visual feedback for hitting
            triggerHitFeedback(data.targetId, data.targetX, data.targetY, false);
        }
        
        if (isTarget) {
            // You were hit - camera bump away from attacker
            triggerHitCameraEffect(data.attackerX, data.attackerY, true);
            // Visual feedback for being hit
            triggerHitFeedback(data.attackerId, data.attackerX, data.attackerY, true);
            // Update health to match server state
            const oldHealth = gameState.health;
            gameState.health = data.targetNewHealth;
            // Update health bar and trigger damage effect if health decreased
            if (oldHealth !== data.targetNewHealth) {
                // Preserve previous health before updating to ensure damage effect triggers
                previousHealth = oldHealth;
                updateHealthBar();
            } else if (data.damageDealt > 0) {
                // Health didn't change but damage was dealt (shouldn't happen, but handle it)
                previousHealth = oldHealth;
                updateHealthBar();
            }
        }
        
        // Update other player's health and visual feedback
        if (!isAttacker && !isTarget) {
            const otherPlayer = otherPlayers.get(data.targetId);
            if (otherPlayer) {
                const oldHealth = otherPlayer.health;
                otherPlayer.health = data.targetNewHealth;
                // Force health dots update immediately
                forceUpdateHealthDots(otherPlayer);
                // Show damage effect on other player if damage was dealt
                if (data.damageDealt > 0 && oldHealth > data.targetNewHealth) {
                    triggerOtherPlayerDamageEffect(data.targetId);
                }
            }
        }
    });
    
    // Mana cast complete notification from server
    socket.on('manaCastComplete', (data) => {
        // Health increased, so don't trigger damage effect
        const oldHealth = gameState.health;
        gameState.health = data.health;
        gameState.isCastingMana = false;
        gameState.manaCastEndTime = 0;
        previousHealth = gameState.health; // Update previous health without triggering damage
        updateHealthBar();
    });
}

// Generate map from seed (for multiplayer consistency)
function generateMapFromSeed(seed) {
    // Simple seeded random function
    let seedValue = seed;
    function seededRandom() {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
    }
    
    // Initialize map
    map = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            map[y][x] = false;
        }
    }
    
    // Generate wall clumps using seeded random
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            const dx = x - MAP_CENTER_X;
            const dy = y - MAP_CENTER_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDistance = Math.min(distance / MAX_DISTANCE_FROM_CENTER, 1.0);
            const probability = WALL_CLUMP_BASE_PROBABILITY + 
                               (WALL_CLUMP_MAX_PROBABILITY - WALL_CLUMP_BASE_PROBABILITY) * normalizedDistance;
            
            if (seededRandom() < probability && !map[y][x]) {
                generateWallClumpSeeded(x, y, seededRandom);
            }
        }
    }
    
    // Ensure center is clear
    const playerX = Math.floor(WORLD_WIDTH / 2);
    const playerY = Math.floor(WORLD_HEIGHT / 2);
    map[playerY][playerX] = false;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = playerX + dx;
            const ny = playerY + dy;
            if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
                map[ny][nx] = false;
            }
        }
    }
}

function generateWallClumpSeeded(startX, startY, randomFn) {
    const clumpSize = Math.floor(randomFn() * (WALL_CLUMP_SIZE_MAX - WALL_CLUMP_SIZE_MIN + 1)) + WALL_CLUMP_SIZE_MIN;
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    
    let cellsPlaced = 0;
    
    while (queue.length > 0 && cellsPlaced < clumpSize) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;
        
        if (visited.has(key)) continue;
        if (current.x < 0 || current.x >= WORLD_WIDTH || current.y < 0 || current.y >= WORLD_HEIGHT) continue;
        
        visited.add(key);
        map[current.y][current.x] = true;
        cellsPlaced++;
        
        const directions = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 }
        ];
        
        for (const dir of directions) {
            const nx = current.x + dir.x;
            const ny = current.y + dir.y;
            const nextKey = `${nx},${ny}`;
            
            if (!visited.has(nextKey) && 
                nx >= 0 && nx < WORLD_WIDTH && 
                ny >= 0 && ny < WORLD_HEIGHT &&
                randomFn() < WALL_CLUMP_SPREAD_CHANCE) {
                queue.push({ x: nx, y: ny });
            }
        }
    }
}

// Other player management
function addOtherPlayer(playerData) {
    const playerElement = document.createElement('div');
    playerElement.className = 'other-player';
    playerElement.id = `player-${playerData.id}`;
    playerElement.style.backgroundColor = playerData.color;
    world.appendChild(playerElement);
    
    // Create health dots for other player
    const healthDotsContainer = document.createElement('div');
    healthDotsContainer.className = 'health-dots';
    healthDotsContainer.id = `health-dots-${playerData.id}`;
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'health-dot';
        healthDotsContainer.appendChild(dot);
    }
    world.appendChild(healthDotsContainer);
    
    // Create mana cast bar for other player
    const manaCastBarContainer = document.createElement('div');
    manaCastBarContainer.className = 'mana-cast-bar';
    manaCastBarContainer.id = `mana-cast-bar-${playerData.id}`;
    const manaCastBarFill = document.createElement('div');
    manaCastBarFill.className = 'mana-cast-fill';
    manaCastBarContainer.appendChild(manaCastBarFill);
    world.appendChild(manaCastBarContainer);
    
    // Convert server timestamp to client-relative time for mana cast
    const now = performance.now() / 1000;
    const serverNow = Date.now() / 1000;
    let manaCastEndTime = 0;
    if (playerData.manaCastEndTime > 0) {
        const timeUntilCastComplete = playerData.manaCastEndTime - serverNow;
        manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
    }
    
    otherPlayers.set(playerData.id, {
        id: playerData.id,
        x: playerData.x,
        y: playerData.y,
        targetX: playerData.targetX,
        targetY: playerData.targetY,
        interpolatedX: playerData.x,
        interpolatedY: playerData.y,
        health: playerData.health,
        maxHealth: playerData.maxHealth,
        dashCooldownEndTime: playerData.dashCooldownEndTime,
        manaCooldownEndTime: playerData.manaCooldownEndTime,
        isDashing: playerData.isDashing,
        isCastingMana: playerData.isCastingMana,
        manaCastEndTime: manaCastEndTime,
        color: playerData.color,
        element: playerElement,
        healthDots: healthDotsContainer,
        manaCastBar: manaCastBarContainer,
        manaCastFill: manaCastBarFill,
        lastMovementDirection: null,
        wobbleStartTime: null
    });
}

function removeOtherPlayer(playerId) {
    const player = otherPlayers.get(playerId);
    if (player) {
        if (player.element) {
            player.element.remove();
        }
        if (player.healthDots) {
            player.healthDots.remove();
        }
        if (player.manaCastBar) {
            player.manaCastBar.remove();
        }
    }
    otherPlayers.delete(playerId);
}

function updateOtherPlayer(playerData) {
    const player = otherPlayers.get(playerData.id);
    if (player) {
        // Only update fields that are present (delta compression support)
        if (playerData.x !== undefined) player.x = playerData.x;
        if (playerData.y !== undefined) player.y = playerData.y;
        if (playerData.targetX !== undefined) player.targetX = playerData.targetX;
        if (playerData.targetY !== undefined) player.targetY = playerData.targetY;
        if (playerData.health !== undefined) player.health = playerData.health;
        if (playerData.maxHealth !== undefined) player.maxHealth = playerData.maxHealth;
        if (playerData.isDashing !== undefined) player.isDashing = playerData.isDashing;
        if (playerData.isCastingMana !== undefined) player.isCastingMana = playerData.isCastingMana;
        
        // Update cooldowns only if provided
        if (playerData.dashCooldownEndTime !== undefined) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            if (playerData.dashCooldownEndTime === 0) {
                // Server explicitly cleared cooldown (expired)
                player.dashCooldownEndTime = 0;
            } else {
                const timeUntilDash = playerData.dashCooldownEndTime - serverNow;
                player.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
            }
        } else {
            // If cooldown not provided, check if it should have expired
            const now = performance.now() / 1000;
            if (player.dashCooldownEndTime > 0 && player.dashCooldownEndTime <= now) {
                // Cooldown should have expired - clear it
                player.dashCooldownEndTime = 0;
            }
        }
        
        if (playerData.manaCooldownEndTime !== undefined) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            const timeUntilMana = playerData.manaCooldownEndTime - serverNow;
            player.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        }
        
        // Update color if it changed
        if (playerData.color && playerData.color !== player.color) {
            player.color = playerData.color;
            if (player.element) {
                player.element.style.backgroundColor = playerData.color;
            }
        }
        
        // Convert server timestamp to client-relative time
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        if (playerData.manaCastEndTime !== undefined) {
            if (playerData.manaCastEndTime > 0) {
                const timeUntilCastComplete = playerData.manaCastEndTime - serverNow;
                player.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
            } else {
                player.manaCastEndTime = 0;
            }
        }
    } else {
        addOtherPlayer(playerData);
    }
}

function updateOtherPlayerPosition(playerId, x, y, targetX, targetY) {
    const player = otherPlayers.get(playerId);
    if (player) {
        // Store previous interpolated position to detect movement direction
        const prevInterpolatedX = player.interpolatedX;
        const prevInterpolatedY = player.interpolatedY;
        
        player.x = x;
        player.y = y;
        player.targetX = targetX;
        player.targetY = targetY;
        
        // Calculate movement direction client-side based on position change
        // This is calculated locally to save bandwidth - server only sends positions
        const diffX = targetX - prevInterpolatedX;
        const diffY = targetY - prevInterpolatedY;
        
        // Only update direction if there's actual movement
        if (Math.abs(diffX) > 0.01 || Math.abs(diffY) > 0.01) {
            if (Math.abs(diffX) > Math.abs(diffY)) {
                player.lastMovementDirection = diffX > 0 ? 'RIGHT' : 'LEFT';
            } else {
                player.lastMovementDirection = diffY > 0 ? 'DOWN' : 'UP';
            }
        }
        
        // Wobble animation is calculated client-side when movement completes
        // No need to send wobble state from server - it's purely visual
        player.wobbleStartTime = null; // Will be set when interpolation completes
    }
}

// ============================================================================
// MAP GENERATION
// ============================================================================

function generateMap() {
    // Initialize map with all empty cells
    map = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            map[y][x] = false;
        }
    }
    
    // Generate wall clumps
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            // Calculate distance from center
            const dx = x - MAP_CENTER_X;
            const dy = y - MAP_CENTER_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate probability based on distance (normalized to 0-1)
            const normalizedDistance = Math.min(distance / MAX_DISTANCE_FROM_CENTER, 1.0);
            const probability = WALL_CLUMP_BASE_PROBABILITY + 
                               (WALL_CLUMP_MAX_PROBABILITY - WALL_CLUMP_BASE_PROBABILITY) * normalizedDistance;
            
            // Check if we should start a clump here
            if (Math.random() < probability && !map[y][x]) {
                generateWallClump(x, y);
            }
        }
    }
    
    // Ensure player starting position is clear
    const playerX = Math.floor(WORLD_WIDTH / 2);
    const playerY = Math.floor(WORLD_HEIGHT / 2);
    map[playerY][playerX] = false;
    // Also clear immediate surrounding area for player
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = playerX + dx;
            const ny = playerY + dy;
            if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
                map[ny][nx] = false;
            }
        }
    }
}

function generateWallClump(startX, startY) {
    const clumpSize = Math.floor(Math.random() * (WALL_CLUMP_SIZE_MAX - WALL_CLUMP_SIZE_MIN + 1)) + WALL_CLUMP_SIZE_MIN;
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    
    let cellsPlaced = 0;
    
    while (queue.length > 0 && cellsPlaced < clumpSize) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;
        
        // Skip if already visited or out of bounds
        if (visited.has(key)) continue;
        if (current.x < 0 || current.x >= WORLD_WIDTH || current.y < 0 || current.y >= WORLD_HEIGHT) continue;
        
        visited.add(key);
        map[current.y][current.x] = true;
        cellsPlaced++;
        
        // Try to spread to adjacent cells
        const directions = [
            { x: 0, y: -1 }, // Up
            { x: 0, y: 1 },  // Down
            { x: -1, y: 0 }, // Left
            { x: 1, y: 0 }   // Right
        ];
        
        for (const dir of directions) {
            const nx = current.x + dir.x;
            const ny = current.y + dir.y;
            const nextKey = `${nx},${ny}`;
            
            if (!visited.has(nextKey) && 
                nx >= 0 && nx < WORLD_WIDTH && 
                ny >= 0 && ny < WORLD_HEIGHT &&
                Math.random() < WALL_CLUMP_SPREAD_CHANCE) {
                queue.push({ x: nx, y: ny });
            }
        }
    }
}

function isWall(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
        return true; // Out of bounds counts as wall
    }
    return map[y][x] === true;
}

// Check if a fractional position (for interpolation) would be in a wall
// Uses the grid cell the position is in
function isPositionInWall(x, y) {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    return isWall(gridX, gridY);
}

// Find nearest valid (non-wall) position
function findNearestValidPosition(startX, startY) {
    const maxRadius = 10; // Maximum search radius
    
    // Check starting position first
    if (!isWall(startX, startY)) {
        return { x: startX, y: startY };
    }
    
    // Search in expanding radius
    for (let radius = 1; radius <= maxRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check positions on the edge of current radius
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const testX = startX + dx;
                const testY = startY + dy;
                
                if (!isWall(testX, testY)) {
                    return { x: testX, y: testY };
                }
            }
        }
    }
    
    // Fallback to center if nothing found
    return { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
}

// Clamp interpolated position to ensure it never goes into a wall
function clampInterpolatedPosition(interpolatedX, interpolatedY, targetX, targetY, currentX, currentY) {
    // Check if interpolated position is in a wall
    if (isPositionInWall(interpolatedX, interpolatedY)) {
        // If target is valid, snap to current position (don't move into wall)
        if (!isWall(targetX, targetY)) {
            // Target is valid, but we're interpolating through a wall
            // Clamp to current position to prevent wall penetration
            return { x: currentX, y: currentY };
        } else {
            // Target is also invalid, stay at current position
            return { x: currentX, y: currentY };
        }
    }
    
    // Position is valid, return as-is
    return { x: interpolatedX, y: interpolatedY };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

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
    
    // Initialize canvas context
    ctx = canvasGrid.getContext('2d');
    if (!ctx) {
        console.error('Failed to get 2D rendering context');
        return;
    }
    
    // Initialize multiplayer connection
    initMultiplayer();
    
    // Generate the map (will be regenerated with seed when server connects)
    // This ensures we have a map to render immediately, preventing grey screen
    generateMap();
    
    // Ensure map is properly initialized
    if (!map || map.length === 0) {
        console.warn('Map generation failed, initializing empty map');
        map = [];
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            map[y] = [];
            for (let x = 0; x < WORLD_WIDTH; x++) {
                map[y][x] = false;
            }
        }
    }
    
    calculateTileSize();
    centerCameraOnRedSquare();
    
    // Force initial render to prevent grey screen
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
    
    // Initialize health bar display
    updateHealthBar();
    
    // Initialize mana bar display
    updateManaBar();
    
    // Check game running status initially (this will hide bars if not connected)
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
        // Only focus if clicking directly on game elements (not if clicking through to something else)
        const target = event.target;
        if (target === viewport || target === canvasGrid || target === world || target === redSquare) {
            // Check if user is clicking on an input element
            if (!(target instanceof HTMLInputElement || 
                  target instanceof HTMLTextAreaElement ||
                  target instanceof HTMLSelectElement ||
                  target.isContentEditable)) {
                viewport.focus();
            }
        }
    });
    
    // Make viewport focusable
    viewport.setAttribute('tabindex', '0');
    
    console.log('Tile engine initialized');
    console.log('World size:', WORLD_WIDTH, 'x', WORLD_HEIGHT);
    console.log('Tile size:', tileSize, 'px');
}

// ============================================================================
// TILE SIZE CALCULATION
// ============================================================================

function calculateTileSize() {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    // Calculate base tile size to fit WORLD_WIDTH tiles across viewport
    const tileSizeByWidth = viewportWidth / WORLD_WIDTH;
    const tileSizeByHeight = viewportHeight / WORLD_HEIGHT;
    
    // Use the smaller to ensure everything fits
    let baseTileSize = Math.floor(Math.min(tileSizeByWidth, tileSizeByHeight));
    
    // Minimum tile size
    baseTileSize = Math.max(baseTileSize, 10);
    
    // Apply zoom factor
    tileSize = baseTileSize * gameState.zoom;
    
    // Update canvas size to match viewport (device pixel ratio for crisp rendering)
    const dpr = window.devicePixelRatio || 1;
    canvasGrid.width = viewportWidth * dpr;
    canvasGrid.height = viewportHeight * dpr;
    canvasGrid.style.width = viewportWidth + 'px';
    canvasGrid.style.height = viewportHeight + 'px';
    ctx.scale(dpr, dpr);
}

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

// Convert grid coordinates to world pixel coordinates
function gridToWorldPixels(gridX, gridY) {
    return {
        x: gridX * tileSize,
        y: gridY * tileSize
    };
}

// Convert world pixel coordinates to grid coordinates
function worldPixelsToGrid(pixelX, pixelY) {
    return {
        x: Math.floor(pixelX / tileSize),
        y: Math.floor(pixelY / tileSize)
    };
}

// Convert world pixel coordinates to viewport pixel coordinates
function worldToViewport(worldX, worldY) {
    const cameraWorldPixels = gridToWorldPixels(gameState.cameraInterpolated.x, gameState.cameraInterpolated.y);
    return {
        x: worldX - cameraWorldPixels.x,
        y: worldY - cameraWorldPixels.y
    };
}

// ============================================================================
// CAMERA SYSTEM
// ============================================================================

function centerCameraOnRedSquare() {
    // Don't reset camera if hit effect is active (let hit effect control camera)
    if (gameState.isHitEffectActive) {
        return;
    }
    
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    // Calculate how many tiles fit in viewport
    const tilesVisibleX = viewportWidth / tileSize;
    const tilesVisibleY = viewportHeight / tileSize;
    
    // Center camera target on player (use interpolated position for smooth following during dash)
    const playerX = gameState.isDashing ? gameState.playerInterpolated.x : gameState.player.x;
    const playerY = gameState.isDashing ? gameState.playerInterpolated.y : gameState.player.y;
    gameState.cameraTarget.x = playerX - (tilesVisibleX / 2);
    gameState.cameraTarget.y = playerY - (tilesVisibleY / 2);
    
    // Clamp camera target to world boundaries
    clampCameraTarget();
}

// Move camera to target position (for hit effect)
function moveCameraToPosition(targetX, targetY) {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    // Calculate how many tiles fit in viewport
    const tilesVisibleX = viewportWidth / tileSize;
    const tilesVisibleY = viewportHeight / tileSize;
    
    // Center camera target on target position
    gameState.cameraTarget.x = targetX - (tilesVisibleX / 2);
    gameState.cameraTarget.y = targetY - (tilesVisibleY / 2);
    
    // Clamp camera target to world boundaries
    clampCameraTarget();
}

// Trigger camera effect when hitting an enemy or being hit
// enemyX, enemyY: position of the other player
// bumpAway: if true, bump away from enemy (when hit); if false, bump toward enemy (when hitting)
function triggerHitCameraEffect(enemyX, enemyY, bumpAway = false) {
    // Set flag to prevent camera from being reset during effect
    gameState.isHitEffectActive = true;
    
    // Calculate direction from player to enemy
    const playerX = gameState.player.x;
    const playerY = gameState.player.y;
    const dirX = enemyX - playerX;
    const dirY = enemyY - playerY;
    
    // Normalize direction vector
    const distance = Math.sqrt(dirX * dirX + dirY * dirY);
    if (distance < 0.01) {
        gameState.isHitEffectActive = false;
        return; // Too close, skip effect
    }
    
    const normalizedX = dirX / distance;
    const normalizedY = dirY / distance;
    
    // If bumping away (when hit), reverse the direction
    const bumpX = bumpAway ? -normalizedX : normalizedX;
    const bumpY = bumpAway ? -normalizedY : normalizedY;
    
    // Bump amount (in grid tiles) - more aggressive when hitting (whack effect)
    const BUMP_DISTANCE = bumpAway ? 0.4 : 0.7; // Bigger jab when attacking
    
    // Calculate bump position (current camera position + bump in direction)
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const tilesVisibleX = viewportWidth / tileSize;
    const tilesVisibleY = viewportHeight / tileSize;
    
    // Current camera center (player position)
    const currentCameraCenterX = playerX;
    const currentCameraCenterY = playerY;
    
    // Bump camera in hit direction
    const bumpedCenterX = currentCameraCenterX + bumpX * BUMP_DISTANCE;
    const bumpedCenterY = currentCameraCenterY + bumpY * BUMP_DISTANCE;
    
    // Set camera target to bumped position
    gameState.cameraTarget.x = bumpedCenterX - (tilesVisibleX / 2);
    gameState.cameraTarget.y = bumpedCenterY - (tilesVisibleY / 2);
    clampCameraTarget();
    
    // Use faster camera speed for quick bump effect - even faster when attacking
    const originalArrivalTime = gameState.cameraArrivalTime;
    gameState.cameraArrivalTime = bumpAway ? 0.1 : 0.05; // Very fast jab when attacking
    
    // Add shake effect - use different shake for attacking vs being hit
    if (bumpAway) {
        viewport.classList.add('damage-shake');
    } else {
        viewport.classList.add('attack-shake');
    }
    
    // Duration depends on whether attacking or being hit
    const effectDuration = bumpAway ? 200 : 250; // Slightly longer for attack effect
    
    // After effect duration, return camera to player and remove shake
    setTimeout(() => {
        // Return camera to player (still using fast speed)
        centerCameraOnRedSquare();
        // Remove shake
        viewport.classList.remove('damage-shake');
        viewport.classList.remove('attack-shake');
        
        // Restore normal camera speed and clear flag after a short delay to allow return movement
        setTimeout(() => {
            gameState.cameraArrivalTime = originalArrivalTime;
            gameState.isHitEffectActive = false;
        }, 150); // Give camera time to return
    }, effectDuration);
}

function clampCameraTarget() {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    const tilesVisibleX = viewportWidth / tileSize;
    const tilesVisibleY = viewportHeight / tileSize;
    
    const maxCameraX = WORLD_WIDTH - tilesVisibleX;
    const maxCameraY = WORLD_HEIGHT - tilesVisibleY;
    
    gameState.cameraTarget.x = Math.max(0, Math.min(maxCameraX, gameState.cameraTarget.x));
    gameState.cameraTarget.y = Math.max(0, Math.min(maxCameraY, gameState.cameraTarget.y));
}

// Easing function for smooth deceleration (ease-out cubic)
function easeOutCubic(t) {
    // Steepen the curve for a more apparent ease out by increasing the exponent
    return 1 - Math.pow(1 - t, 5);
}

// Animation loop for smooth movement
function startAnimationLoop() {
    lastFrameTime = performance.now();
    function animate() {
        updateAnimations();
        render();
        animationFrameId = requestAnimationFrame(animate);
    }
    animate();
}

function updateAnimations() {
    // Calculate delta time for frame-rate independent movement
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - lastFrameTime) / 1000, 0.1); // Clamp to max 100ms
    lastFrameTime = currentTime;
    
    // Update dash cooldown bar
    updateDashCooldownBar();
    
    // Update health bar
    updateHealthBar();
    
    // Update mana bar
    updateManaBar();
    
    // Check if mana cast is complete
    const currentTimeSeconds = currentTime / 1000;
    if (gameState.isCastingMana && gameState.manaCastEndTime <= currentTimeSeconds) {
        // Mana cast complete - restore health (health increased, don't trigger damage effect)
        const oldHealth = gameState.health;
        gameState.health = Math.min(gameState.maxHealth, gameState.health + 1);
        gameState.isCastingMana = false;
        previousHealth = gameState.health; // Update previous health without triggering damage
        updateHealthBar();
    }
    
    // Player movement with frame-rate independence and easing
    const playerDiffX = gameState.playerTarget.x - gameState.playerInterpolated.x;
    const playerDiffY = gameState.playerTarget.y - gameState.playerInterpolated.y;
    // Performance optimization: Use squared distance for comparison, only sqrt when needed
    const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
    const playerDistance = Math.sqrt(playerDistanceSquared);
    
    if (playerDistance < 0.01) {
        // Movement complete - snap to exact target
        gameState.playerInterpolated.x = gameState.playerTarget.x;
        gameState.playerInterpolated.y = gameState.playerTarget.y;
        
        // If this was a dash, mark it as complete
        if (gameState.isDashing) {
            gameState.isDashing = false;
        }
        
        // Start wobble effect if not already wobbling
        if (gameState.lastMovementDirection !== null && gameState.wobbleStartTime === null) {
            gameState.wobbleStartTime = currentTime;
        }
        
        gameState.lastMovementDirection = null; // Clear direction when stopped
        
        // If there are queued movements, process the next one
        // Otherwise, if keys are still pressed, queue movements from pressed keys
        // Don't process movement if casting mana
        if (!gameState.isCastingMana) {
            if (gameState.movementQueue.length > 0) {
                processNextMovement();
            } else if (gameState.pressedKeys.size > 0) {
                queueMovementFromPressedKeys();
            }
        }
    } else {
        // Determine movement direction for squash/stretch
        if (Math.abs(playerDiffX) > Math.abs(playerDiffY)) {
            gameState.lastMovementDirection = playerDiffX > 0 ? 'RIGHT' : 'LEFT';
        } else {
            gameState.lastMovementDirection = playerDiffY > 0 ? 'DOWN' : 'UP';
        }
        
        // Clear wobble when starting new movement
        gameState.wobbleStartTime = null;
        
        // Start next movement early for seamless transition
        if (playerDistance < TRANSITION_THRESHOLD && gameState.movementQueue.length > 0) {
            processNextMovement();
        }
        
        // Frame-rate independent movement with ease-out easing
        // Use faster speed during dash
        const currentSpeed = gameState.isDashing ? DASH_SPEED : BASE_ANIMATION_SPEED;
        const moveAmount = currentSpeed * deltaTime;
        const progress = Math.min(moveAmount / playerDistance, 1);
        
        // Apply ease-out cubic for smooth deceleration
        const easedProgress = easeOutCubic(progress);
        
        // Calculate new interpolated position
        const newInterpolatedX = gameState.playerInterpolated.x + playerDiffX * easedProgress;
        const newInterpolatedY = gameState.playerInterpolated.y + playerDiffY * easedProgress;
        
        // Clamp interpolated position to prevent wall penetration
        const clamped = clampInterpolatedPosition(
            newInterpolatedX, 
            newInterpolatedY, 
            gameState.playerTarget.x, 
            gameState.playerTarget.y,
            gameState.player.x,
            gameState.player.y
        );
        
        gameState.playerInterpolated.x = clamped.x;
        gameState.playerInterpolated.y = clamped.y;
        
        // If we clamped the position, ensure we're not trying to move into a wall
        // Validate that current and target positions are valid
        if (isWall(gameState.player.x, gameState.player.y)) {
            // Current position is invalid, snap to target if valid
            if (!isWall(gameState.playerTarget.x, gameState.playerTarget.y)) {
                gameState.player.x = gameState.playerTarget.x;
                gameState.player.y = gameState.playerTarget.y;
                gameState.playerInterpolated.x = gameState.playerTarget.x;
                gameState.playerInterpolated.y = gameState.playerTarget.y;
            }
        }
        
        if (isWall(gameState.playerTarget.x, gameState.playerTarget.y)) {
            // Target position is invalid, don't move
            gameState.playerTarget.x = gameState.player.x;
            gameState.playerTarget.y = gameState.player.y;
            gameState.playerInterpolated.x = gameState.player.x;
            gameState.playerInterpolated.y = gameState.player.y;
        }
    }
    
    // Update camera target to follow player during dash (for smooth following)
    if (gameState.isDashing && !gameState.isHitEffectActive) {
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        const tilesVisibleX = viewportWidth / tileSize;
        const tilesVisibleY = viewportHeight / tileSize;
        // Follow interpolated position during dash for smooth camera movement
        gameState.cameraTarget.x = gameState.playerInterpolated.x - (tilesVisibleX / 2);
        gameState.cameraTarget.y = gameState.playerInterpolated.y - (tilesVisibleY / 2);
        clampCameraTarget();
    }
    
    // Camera interpolation with frame-rate independence
    // Camera always arrives within cameraArrivalTime seconds
    const cameraDiffX = gameState.cameraTarget.x - gameState.cameraInterpolated.x;
    const cameraDiffY = gameState.cameraTarget.y - gameState.cameraInterpolated.y;
    // Performance optimization: Use squared distance for comparison, only sqrt when needed
    const cameraDistanceSquared = cameraDiffX * cameraDiffX + cameraDiffY * cameraDiffY;
    const cameraDistance = Math.sqrt(cameraDistanceSquared);
    
    if (cameraDistance > 0.001) {
        // Calculate required speed to arrive within cameraArrivalTime seconds
        const requiredSpeed = cameraDistance / gameState.cameraArrivalTime;
        
        // Frame-rate independent camera movement with dynamic speed
        const cameraMoveAmount = requiredSpeed * deltaTime;
        const progress = Math.min(cameraMoveAmount / cameraDistance, 1);
        
        // Apply ease-out easing for smooth camera movement
        const easedProgress = easeOutCubic(progress);
        
        gameState.cameraInterpolated.x += cameraDiffX * easedProgress;
        gameState.cameraInterpolated.y += cameraDiffY * easedProgress;
        
        // Snap to target if very close
        if (cameraDistance < 0.01) {
            gameState.cameraInterpolated.x = gameState.cameraTarget.x;
            gameState.cameraInterpolated.y = gameState.cameraTarget.y;
        }
    }
    
    // Update actual camera position for rendering
    gameState.camera.x = gameState.cameraInterpolated.x;
    gameState.camera.y = gameState.cameraInterpolated.y;
    
    // Interpolate other players
    for (const [playerId, player] of otherPlayers.entries()) {
        const diffX = player.targetX - player.interpolatedX;
        const diffY = player.targetY - player.interpolatedY;
        // Performance optimization: Use squared distance for comparison, only sqrt when needed
        const distanceSquared = diffX * diffX + diffY * diffY;
        const distance = Math.sqrt(distanceSquared);
        
        if (distance < 0.01) {
            player.interpolatedX = player.targetX;
            player.interpolatedY = player.targetY;
            
            // Start wobble effect
            if (player.lastMovementDirection !== null && player.wobbleStartTime === null) {
                player.wobbleStartTime = currentTime;
            }
            player.lastMovementDirection = null;
        } else {
            // Determine movement direction (calculated client-side for squash/stretch animation)
            if (Math.abs(diffX) > Math.abs(diffY)) {
                player.lastMovementDirection = diffX > 0 ? 'RIGHT' : 'LEFT';
            } else {
                player.lastMovementDirection = diffY > 0 ? 'DOWN' : 'UP';
            }
            
            // Clear wobble when starting new movement (wobble calculated client-side)
            player.wobbleStartTime = null;
            
            // Frame-rate independent movement
            const moveAmount = BASE_ANIMATION_SPEED * deltaTime;
            const progress = Math.min(moveAmount / distance, 1);
            const easedProgress = easeOutCubic(progress);
            
            // Calculate new interpolated position
            const newInterpolatedX = player.interpolatedX + diffX * easedProgress;
            const newInterpolatedY = player.interpolatedY + diffY * easedProgress;
            
            // Clamp interpolated position to prevent wall penetration
            const clamped = clampInterpolatedPosition(
                newInterpolatedX,
                newInterpolatedY,
                player.targetX,
                player.targetY,
                player.x,
                player.y
            );
            
            player.interpolatedX = clamped.x;
            player.interpolatedY = clamped.y;
            
            // Validate positions are not in walls
            if (isWall(player.x, player.y)) {
                player.x = player.targetX;
                player.y = player.targetY;
                player.interpolatedX = player.targetX;
                player.interpolatedY = player.targetY;
            }
            
            if (isWall(player.targetX, player.targetY)) {
                player.targetX = player.x;
                player.targetY = player.y;
                player.interpolatedX = player.x;
                player.interpolatedY = player.y;
            }
        }
        
        // Update mana cast completion for other players
        if (player.isCastingMana && player.manaCastEndTime <= currentTimeSeconds) {
            player.isCastingMana = false;
        }
        
        // Safety check: expire dash cooldown if it should have expired
        if (player.dashCooldownEndTime > 0 && player.dashCooldownEndTime <= currentTimeSeconds) {
            player.dashCooldownEndTime = 0;
        }
    }
}

function updateDashCooldownBar() {
    const currentTime = performance.now() / 1000; // Current time in seconds
    
    // Safety check: if cooldown should have expired, clear it
    if (gameState.dashCooldownEndTime > 0 && gameState.dashCooldownEndTime <= currentTime) {
        gameState.dashCooldownEndTime = 0;
    }
    
    let fillPercentage;
    if (gameState.dashCooldownEndTime > currentTime) {
        // Dash is on cooldown - calculate fill percentage
        const cooldownRemaining = gameState.dashCooldownEndTime - currentTime;
        const cooldownProgress = 1.0 - (cooldownRemaining / DASH_COOLDOWN);
        fillPercentage = Math.max(0, Math.min(100, cooldownProgress * 100));
    } else {
        // Dash is ready - bar should be full
        fillPercentage = 100;
    }
    
    // Only update DOM if value changed (performance optimization)
    if (Math.abs(fillPercentage - lastDashCooldownFill) > 0.1) {
        dashCooldownFill.style.height = fillPercentage + '%';
        lastDashCooldownFill = fillPercentage;
    }
}

function updateGameRunningStatus() {
    if (!gameNotRunningMessage) return;
    
    // Determine if game is running
    const gameRunning = isConnected && socket && socket.connected && myPlayerId !== null;
    
    // Show/hide game not running message
    if (gameRunning) {
        gameNotRunningMessage.style.display = 'none';
    } else {
        gameNotRunningMessage.style.display = 'block';
    }
    
    // Show/hide UI bars based on game status
    const dashCooldownBar = document.getElementById('dashCooldownBar');
    const healthBar = document.getElementById('healthBar');
    const manaBar = document.getElementById('manaBar');
    
    if (dashCooldownBar) {
        dashCooldownBar.style.display = gameRunning ? 'block' : 'none';
    }
    if (healthBar) {
        healthBar.style.display = gameRunning ? 'block' : 'none';
    }
    if (manaBar) {
        manaBar.style.display = gameRunning ? 'block' : 'none';
    }
}

function updateHealthBar() {
    // Calculate health percentage (0 to 100)
    const healthPercentage = (gameState.health / gameState.maxHealth) * 100;
    const clampedPercentage = Math.max(0, Math.min(100, healthPercentage));
    
    // Only update DOM if value changed (performance optimization)
    if (Math.abs(clampedPercentage - lastHealthFill) > 0.1) {
        healthFill.style.height = clampedPercentage + '%';
        lastHealthFill = clampedPercentage;
    }
    
    // Check if player took damage
    if (gameState.health < previousHealth) {
        triggerDamageEffect();
    }
    previousHealth = gameState.health;
}

// Trigger damage visual effect (shake + red tint)
function triggerDamageEffect() {
    if (!viewport || !damageOverlay) return;
    
    // Add shake class
    viewport.classList.add('damage-shake');
    
    // Show red tint
    damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.4)';
    
    // Remove effects after 0.2 seconds
    setTimeout(() => {
        viewport.classList.remove('damage-shake');
        damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0)';
    }, 200);
}

function updateManaBar() {
    const currentTime = performance.now() / 1000; // Current time in seconds
    
    let fillPercentage;
    if (gameState.manaCooldownEndTime > currentTime) {
        // Mana is on cooldown - calculate fill percentage
        const cooldownRemaining = gameState.manaCooldownEndTime - currentTime;
        const cooldownProgress = 1.0 - (cooldownRemaining / MANA_COOLDOWN);
        fillPercentage = Math.max(0, Math.min(100, cooldownProgress * 100));
    } else {
        // Mana is ready - bar should be full
        fillPercentage = 100;
    }
    
    // Only update DOM if value changed (performance optimization)
    if (Math.abs(fillPercentage - lastManaFill) > 0.1) {
        manaFill.style.height = fillPercentage + '%';
        lastManaFill = fillPercentage;
    }
}

function handleMana() {
    // If connected to server, send mana request to server
    if (isConnected && socket) {
        socket.emit('mana');
        // Optimistically update locally (server will confirm)
        const currentTime = performance.now() / 1000;
        if (gameState.manaCooldownEndTime <= currentTime && 
            !gameState.isCastingMana && 
            gameState.health < gameState.maxHealth) {
            gameState.isCastingMana = true;
            gameState.manaCastEndTime = currentTime + MANA_CAST_TIME;
            gameState.movementQueue = [];
            gameState.manaCooldownEndTime = currentTime + MANA_COOLDOWN;
        }
        return;
    }
    
    // Single-player mode
    const currentTime = performance.now() / 1000; // Current time in seconds
    
    // Check if mana is on cooldown
    if (gameState.manaCooldownEndTime > currentTime) {
        return; // Mana is on cooldown
    }
    
    // Check if already casting
    if (gameState.isCastingMana) {
        return; // Already casting
    }
    
    // Check if health is already full
    if (gameState.health >= gameState.maxHealth) {
        return; // Health is already full
    }
    
    // Start casting mana ability
    gameState.isCastingMana = true;
    gameState.manaCastEndTime = currentTime + MANA_CAST_TIME;
    
    // Clear movement queue to stop player movement
    gameState.movementQueue = [];
    
    // Set cooldown
    gameState.manaCooldownEndTime = currentTime + MANA_COOLDOWN;
}

function processNextMovement() {
    // If there are queued movements, process the next one
    if (gameState.movementQueue.length > 0) {
        const action = gameState.movementQueue.shift(); // Remove and get first item
        executeMovement(action);
    }
}

// Client-side input rate limiting
let lastClientMoveTime = 0;
const CLIENT_MOVE_RATE_LIMIT = 100; // Minimum milliseconds between moves (10 moves/sec max)
let clientMoveCount = 0;
let clientMoveCountResetTime = performance.now();

function executeMovement(action) {
    // Calculate target position first
    let newX = gameState.player.x;
    let newY = gameState.player.y;
    
    switch(action) {
        case 'MOVE_UP':
            newY = gameState.player.y - 1;
            break;
        case 'MOVE_DOWN':
            newY = gameState.player.y + 1;
            break;
        case 'MOVE_LEFT':
            newX = gameState.player.x - 1;
            break;
        case 'MOVE_RIGHT':
            newX = gameState.player.x + 1;
            break;
    }
    
    // Client-side wall check: prevent movement if target position is a wall
    if (newX < 0 || newX >= WORLD_WIDTH || 
        newY < 0 || newY >= WORLD_HEIGHT || 
        isWall(newX, newY)) {
        // Wall or out of bounds - don't allow movement
        processNextMovement();
        return;
    }
    
    // If connected to server, send movement to server
    if (isConnected && socket) {
        // Client-side rate limiting to prevent spam
        const now = performance.now();
        if (now - clientMoveCountResetTime >= 1000) {
            clientMoveCount = 0;
            clientMoveCountResetTime = now;
        }
        if (clientMoveCount >= 10) {
            // Too many moves, ignore this one
            return;
        }
        if (now - lastClientMoveTime < CLIENT_MOVE_RATE_LIMIT) {
            // Too soon since last move, ignore
            return;
        }
        
        lastClientMoveTime = now;
        clientMoveCount++;
        
        // Validate current position before attempting move
        if (isWall(gameState.player.x, gameState.player.y)) {
            // Player is in a wall! Don't move, wait for server correction
            console.warn('Player is in a wall, waiting for server correction');
            return;
        }
        
        socket.emit('move', action);
        // Optimistically update locally (server will correct if invalid)
        // Target position already validated above
        gameState.player.x = newX;
        gameState.player.y = newY;
        gameState.playerTarget.x = newX;
        gameState.playerTarget.y = newY;
        // Don't reset camera here - wait for server confirmation
        // If collision happens, collision event will handle camera effect
        return;
    }
    
    // Single-player mode (no server)
    // Target position already validated above
    gameState.player.x = newX;
    gameState.player.y = newY;
    gameState.playerTarget.x = newX;
    gameState.playerTarget.y = newY;
    
    // Update camera target to follow player
    centerCameraOnRedSquare();
}

function handleDash() {
    const currentTime = performance.now() / 1000; // Current time in seconds
    
    // Check if dash is on cooldown
    if (gameState.dashCooldownEndTime > currentTime) {
        return; // Dash is on cooldown
    }
    
    // Determine dash direction from pressed keys
    // Priority: if multiple keys pressed, use the first one found
    let dashDirection = null;
    
    // Check pressed keys in priority order
    const priorityKeys = ['w', 's', 'a', 'd'];
    for (const key of priorityKeys) {
        if (gameState.pressedKeys.has(key)) {
            dashDirection = INPUT_MAP[key];
            break;
        }
    }
    
    // If no movement keys are pressed, dash in the last movement direction
    if (!dashDirection && gameState.lastMovementDirection) {
        // Convert lastMovementDirection to action format
        switch(gameState.lastMovementDirection) {
            case 'UP':
                dashDirection = 'MOVE_UP';
                break;
            case 'DOWN':
                dashDirection = 'MOVE_DOWN';
                break;
            case 'LEFT':
                dashDirection = 'MOVE_LEFT';
                break;
            case 'RIGHT':
                dashDirection = 'MOVE_RIGHT';
                break;
        }
    }
    
    // If still no direction, can't dash
    if (!dashDirection) {
        return;
    }
    
    // Execute dash
    executeDash(dashDirection);
    
    // Don't set cooldown optimistically - wait for server confirmation
    // This ensures all players have the same cooldown timing (server is authoritative)
}

// Client-side dash rate limiting
let lastClientDashTime = 0;
const CLIENT_DASH_RATE_LIMIT = 300; // Minimum milliseconds between dashes

function executeDash(direction) {
    // If connected to server, send dash to server
    if (isConnected && socket) {
        // Client-side rate limiting
        const now = performance.now();
        if (now - lastClientDashTime < CLIENT_DASH_RATE_LIMIT) {
            // Too soon since last dash, ignore
            return;
        }
        lastClientDashTime = now;
        
        // Validate current position before attempting dash
        if (isWall(gameState.player.x, gameState.player.y)) {
            // Player is in a wall! Don't dash, wait for server correction
            console.warn('Player is in a wall, cannot dash');
            return;
        }
        
        socket.emit('dash', direction);
        // Optimistically update locally
        gameState.isDashing = true;
        gameState.movementQueue = [];
        
        // Set temporary optimistic cooldown for immediate feedback
        // This will be overridden by server's authoritative cooldown in dashConfirmed
        // Server is authoritative - ensures all players have exactly 2 second cooldown
        const optimisticTime = performance.now() / 1000;
        gameState.dashCooldownEndTime = optimisticTime + DASH_COOLDOWN;
        
        let deltaX = 0;
        let deltaY = 0;
        
        switch(direction) {
            case 'MOVE_UP':
                deltaY = -1;
                break;
            case 'MOVE_DOWN':
                deltaY = 1;
                break;
            case 'MOVE_LEFT':
                deltaX = -1;
                break;
            case 'MOVE_RIGHT':
                deltaX = 1;
                break;
        }
        
        let finalX = gameState.player.x;
        let finalY = gameState.player.y;
        
        // Only optimistically update if all positions are valid
        for (let i = 1; i <= DASH_DISTANCE; i++) {
            const testX = gameState.player.x + (deltaX * i);
            const testY = gameState.player.y + (deltaY * i);
            
            if (testX >= 0 && testX < WORLD_WIDTH && 
                testY >= 0 && testY < WORLD_HEIGHT && 
                !isWall(testX, testY)) {
                finalX = testX;
                finalY = testY;
            } else {
                break;
            }
        }
        
        // Only update target position if final position is valid
        // Don't update player.x/y - let interpolation handle smooth movement
        if (!isWall(finalX, finalY)) {
            // Set target to final dash position - interpolation will move smoothly
            gameState.playerTarget.x = finalX;
            gameState.playerTarget.y = finalY;
            // Don't update camera here - let it follow smoothly
        }
        return;
    }
    
    // Single-player mode
    // Mark that player is dashing
    gameState.isDashing = true;
    
    // Clear movement queue - dash takes priority
    gameState.movementQueue = [];
    
    let deltaX = 0;
    let deltaY = 0;
    
    // Determine direction vector
    switch(direction) {
        case 'MOVE_UP':
            deltaY = -1;
            break;
        case 'MOVE_DOWN':
            deltaY = 1;
            break;
        case 'MOVE_LEFT':
            deltaX = -1;
            break;
        case 'MOVE_RIGHT':
            deltaX = 1;
            break;
    }
    
    // Find the furthest valid position (up to DASH_DISTANCE blocks)
    let finalX = gameState.player.x;
    let finalY = gameState.player.y;
    
    for (let i = 1; i <= DASH_DISTANCE; i++) {
        const testX = gameState.player.x + (deltaX * i);
        const testY = gameState.player.y + (deltaY * i);
        
        // Check if this position is valid
        if (testX >= 0 && testX < WORLD_WIDTH && 
            testY >= 0 && testY < WORLD_HEIGHT && 
            !isWall(testX, testY)) {
            finalX = testX;
            finalY = testY;
        } else {
            // Hit a wall or boundary, stop here
            break;
        }
    }
    
    // Set target to final dash position - interpolation will move smoothly
    gameState.playerTarget.x = finalX;
    gameState.playerTarget.y = finalY;
    // Don't update player.x/y - let interpolation handle smooth movement
    // Camera will follow smoothly via interpolation
}

// ============================================================================
// RENDERING HELPERS
// ============================================================================

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawWallCell(ctx, x, y, width, height, radius, gridX, gridY) {
    // Check adjacent cells to determine which corners should be rounded
    const hasTopWall = gridY > 0 && map[gridY - 1][gridX];
    const hasBottomWall = gridY < WORLD_HEIGHT - 1 && map[gridY + 1][gridX];
    const hasLeftWall = gridX > 0 && map[gridY][gridX - 1];
    const hasRightWall = gridX < WORLD_WIDTH - 1 && map[gridY][gridX + 1];
    
    // Check diagonal cells for corner rounding
    const hasTopLeftWall = gridY > 0 && gridX > 0 && map[gridY - 1][gridX - 1];
    const hasTopRightWall = gridY > 0 && gridX < WORLD_WIDTH - 1 && map[gridY - 1][gridX + 1];
    const hasBottomLeftWall = gridY < WORLD_HEIGHT - 1 && gridX > 0 && map[gridY + 1][gridX - 1];
    const hasBottomRightWall = gridY < WORLD_HEIGHT - 1 && gridX < WORLD_WIDTH - 1 && map[gridY + 1][gridX + 1];
    
    // Determine which corners to round
    // Round a corner only if BOTH adjacent edges are exposed (not connected to walls)
    // This ensures seamless connections between adjacent walls
    const roundTopLeft = !hasTopWall && !hasLeftWall;
    const roundTopRight = !hasTopWall && !hasRightWall;
    const roundBottomLeft = !hasBottomWall && !hasLeftWall;
    const roundBottomRight = !hasBottomWall && !hasRightWall;
    
    // Extend walls slightly on connected edges to eliminate gaps
    // This ensures walls overlap and cover grid lines between them
    const overlap = GRID_THICKNESS / 2 + 0.5; // Slight overlap to cover grid lines
    
    // Adjust coordinates to extend on connected edges
    let drawX = x;
    let drawY = y;
    let drawWidth = width;
    let drawHeight = height;
    
    if (hasTopWall) {
        drawY -= overlap;
        drawHeight += overlap;
    }
    if (hasBottomWall) {
        drawHeight += overlap;
    }
    if (hasLeftWall) {
        drawX -= overlap;
        drawWidth += overlap;
    }
    if (hasRightWall) {
        drawWidth += overlap;
    }
    
    ctx.beginPath();
    
    // Start from top-left
    if (roundTopLeft) {
        ctx.moveTo(drawX + radius, drawY);
        ctx.lineTo(drawX + drawWidth - (roundTopRight ? radius : 0), drawY);
    } else {
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(drawX + drawWidth - (roundTopRight ? radius : 0), drawY);
    }
    
    // Top-right corner
    if (roundTopRight) {
        ctx.quadraticCurveTo(drawX + drawWidth, drawY, drawX + drawWidth, drawY + radius);
    } else {
        ctx.lineTo(drawX + drawWidth, drawY);
    }
    
    // Right edge
    ctx.lineTo(drawX + drawWidth, drawY + drawHeight - (roundBottomRight ? radius : 0));
    
    // Bottom-right corner
    if (roundBottomRight) {
        ctx.quadraticCurveTo(drawX + drawWidth, drawY + drawHeight, drawX + drawWidth - radius, drawY + drawHeight);
    } else {
        ctx.lineTo(drawX + drawWidth, drawY + drawHeight);
    }
    
    // Bottom edge
    ctx.lineTo(drawX + (roundBottomLeft ? radius : 0), drawY + drawHeight);
    
    // Bottom-left corner
    if (roundBottomLeft) {
        ctx.quadraticCurveTo(drawX, drawY + drawHeight, drawX, drawY + drawHeight - radius);
    } else {
        ctx.lineTo(drawX, drawY + drawHeight);
    }
    
    // Left edge
    ctx.lineTo(drawX, drawY + (roundTopLeft ? radius : 0));
    
    // Top-left corner
    if (roundTopLeft) {
        ctx.quadraticCurveTo(drawX, drawY, drawX + radius, drawY);
    } else {
        ctx.lineTo(drawX, drawY);
    }
    
    ctx.closePath();
}

// ============================================================================
// RENDERING
// ============================================================================

function render() {
    if (tileSize === 0) return;
    
    // Ensure map is initialized (should always be, but safety check)
    if (!map || map.length === 0) {
        // Map not initialized yet - fill canvas with background color to prevent grey screen
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, viewportWidth, viewportHeight);
        return;
    }
    
    // Calculate world dimensions in pixels
    const worldWidthPixels = WORLD_WIDTH * tileSize;
    const worldHeightPixels = WORLD_HEIGHT * tileSize;
    
    // Set world size (only update if changed)
    if (world.style.width !== (worldWidthPixels + 'px')) {
        world.style.width = worldWidthPixels + 'px';
    }
    if (world.style.height !== (worldHeightPixels + 'px')) {
        world.style.height = worldHeightPixels + 'px';
    }
    
    // Position world container based on interpolated camera
    const cameraWorldPixels = gridToWorldPixels(gameState.cameraInterpolated.x, gameState.cameraInterpolated.y);
    const worldLeft = (-cameraWorldPixels.x) + 'px';
    const worldTop = (-cameraWorldPixels.y) + 'px';
    
    // Only update world position if changed (performance optimization)
    if (world.style.left !== worldLeft) {
        world.style.left = worldLeft;
    }
    if (world.style.top !== worldTop) {
        world.style.top = worldTop;
    }
    
    // Performance optimization: Only redraw map when camera position, zoom, or tile size changed
    const cameraX = gameState.cameraInterpolated.x;
    const cameraY = gameState.cameraInterpolated.y;
    const cameraZoom = gameState.zoom;
    const needsMapRedraw = (
        Math.abs(cameraX - lastCameraX) > 0.01 ||
        Math.abs(cameraY - lastCameraY) > 0.01 ||
        Math.abs(cameraZoom - lastCameraZoom) > 0.01 ||
        tileSize !== lastTileSize
    );
    
    if (needsMapRedraw) {
        drawMap(ctx);
        lastCameraX = cameraX;
        lastCameraY = cameraY;
        lastCameraZoom = cameraZoom;
        lastTileSize = tileSize;
    }
    
    // Render entities using interpolated position
    renderRedSquare();
    
    // Render other players
    renderOtherPlayers();
}

function drawMap(ctx) {
    // Calculate visible tile range based on camera
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    // Clear canvas with background color
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    
    // Safety check: ensure map is initialized
    if (!map || map.length === 0 || !map[0] || map[0].length === 0) {
        // Map not initialized - just show white background
        return;
    }
    
    // Calculate which tiles are visible in the viewport using interpolated camera
    const startX = Math.max(0, Math.floor(gameState.cameraInterpolated.x));
    const startY = Math.max(0, Math.floor(gameState.cameraInterpolated.y));
    const endX = Math.min(WORLD_WIDTH, Math.ceil(gameState.cameraInterpolated.x + (viewportWidth / tileSize)));
    const endY = Math.min(WORLD_HEIGHT, Math.ceil(gameState.cameraInterpolated.y + (viewportHeight / tileSize)));
    
    // First pass: Draw all tiles (walls and empty cells)
    for (let gridY = startY; gridY < endY; gridY++) {
        // Safety check for map bounds
        if (gridY < 0 || gridY >= map.length || !map[gridY]) continue;
        
        for (let gridX = startX; gridX < endX; gridX++) {
            // Safety check for map bounds
            if (gridX < 0 || gridX >= map[gridY].length) continue;
            
            // Convert grid coordinates to world pixels
            const worldPixels = gridToWorldPixels(gridX, gridY);
            
            // Convert world pixels to viewport pixels (screen coordinates)
            const viewportPixels = worldToViewport(worldPixels.x, worldPixels.y);
            
            // Skip tiles that are completely outside the viewport
            if (viewportPixels.x + tileSize < 0 || viewportPixels.x > viewportWidth ||
                viewportPixels.y + tileSize < 0 || viewportPixels.y > viewportHeight) {
                continue;
            }
            
            // Draw tile with crisp lines (align to pixel boundaries)
            // Check if this is a wall
            const isWallCell = map[gridY][gridX];
            
            const baseX = Math.round(viewportPixels.x);
            const baseY = Math.round(viewportPixels.y);
            
            if (isWallCell) {
                // Draw wall with seamless connections - only round exposed corners
                ctx.fillStyle = 'black';
                drawWallCell(ctx, baseX, baseY, tileSize, tileSize, WALL_CORNER_RADIUS, gridX, gridY);
                ctx.fill();
            } else {
                // Fill empty cells with background color
                ctx.fillStyle = BACKGROUND_COLOR;
                ctx.fillRect(baseX, baseY, tileSize, tileSize);
            }
            
            // Draw border with crisp lines using configurable opacity and thickness
            // Skip grid lines between adjacent walls to prevent gaps
            // Check adjacent cells for grid line drawing
            const hasTopWall = gridY > 0 && map[gridY - 1][gridX];
            const hasBottomWall = gridY < WORLD_HEIGHT - 1 && map[gridY + 1][gridX];
            const hasLeftWall = gridX > 0 && map[gridY][gridX - 1];
            const hasRightWall = gridX < WORLD_WIDTH - 1 && map[gridY][gridX + 1];
            
            // Only draw grid lines if not between two walls
            if (!isWallCell || !hasTopWall || !hasBottomWall || !hasLeftWall || !hasRightWall) {
                ctx.strokeStyle = `rgba(0, 0, 0, ${GRID_OPACITY})`;
                ctx.lineWidth = GRID_THICKNESS;
                ctx.beginPath();
                const x = baseX + (GRID_THICKNESS / 2);
                const y = baseY + (GRID_THICKNESS / 2);
                const size = tileSize - GRID_THICKNESS;
                
                // Only draw edges that aren't between two walls
                if (!isWallCell || !hasTopWall) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + size, y);
                }
                if (!isWallCell || !hasRightWall) {
                    ctx.moveTo(x + size, y);
                    ctx.lineTo(x + size, y + size);
                }
                if (!isWallCell || !hasBottomWall) {
                    ctx.moveTo(x + size, y + size);
                    ctx.lineTo(x, y + size);
                }
                if (!isWallCell || !hasLeftWall) {
                    ctx.moveTo(x, y + size);
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }
    }
}

// Note: drawPlayerGlow() function removed - it was never called (dead code optimization)

function renderRedSquare() {
    // Convert interpolated grid coordinates to world pixels (top-left of cell)
    const worldPixels = gridToWorldPixels(gameState.playerInterpolated.x, gameState.playerInterpolated.y);
    
    // Set size based on PLAYER_SIZE variable (1.0 = full cell size)
    const squareSize = Math.round(tileSize * PLAYER_SIZE);
    
    // Calculate offset to center square in the cell
    // Remaining space = tileSize - squareSize
    // Offset on each side = (tileSize - squareSize) / 2
    const offset = Math.round((tileSize - squareSize) / 2);
    
    // Calculate squash and stretch based on movement
    let scaleX = 1.0;
    let scaleY = 1.0;
    
    if (gameState.lastMovementDirection) {
        const playerDiffX = gameState.playerTarget.x - gameState.playerInterpolated.x;
        const playerDiffY = gameState.playerTarget.y - gameState.playerInterpolated.y;
        // Performance optimization: Use squared distance for comparison, only sqrt when needed
        const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
        const playerDistance = Math.sqrt(playerDistanceSquared);
        
        // Calculate movement intensity (0 to 1)
        const movementIntensity = Math.min(playerDistance, 1.0);
        
        // Apply squash and stretch based on direction
        const stretchAmount = movementIntensity * SQUASH_STRETCH_INTENSITY;
        const squashAmount = movementIntensity * (SQUASH_STRETCH_INTENSITY * 0.67); // Squash is 2/3 of stretch
        
        switch (gameState.lastMovementDirection) {
            case 'LEFT':
            case 'RIGHT':
                scaleX = 1.0 + stretchAmount; // Stretch horizontally
                scaleY = 1.0 - squashAmount;  // Squash vertically
                break;
            case 'UP':
            case 'DOWN':
                scaleX = 1.0 - squashAmount;  // Squash horizontally
                scaleY = 1.0 + stretchAmount; // Stretch vertically
                break;
        }
    }
    
    // Apply jelly wobble effect when arriving at destination
    if (gameState.wobbleStartTime !== null) {
        const currentTime = performance.now();
        const wobbleAge = (currentTime - gameState.wobbleStartTime) / 1000; // Age in seconds
        
        if (wobbleAge < JELLY_WOBBLE_DURATION) {
            // Calculate decay factor (1.0 at start, 0.0 at end)
            const decay = 1.0 - (wobbleAge / JELLY_WOBBLE_DURATION);
            
            // Create slow wobbling oscillation
            const wobbleX = Math.sin(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
            const wobbleY = Math.cos(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
            
            // Apply wobble to scale (subtle oscillation)
            scaleX += wobbleX;
            scaleY += wobbleY;
        } else {
            // Wobble complete, clear it
            gameState.wobbleStartTime = null;
        }
    }
    
    // Position relative to world container (centered in cell)
    // Use interpolated position for smooth movement
    // Performance optimization: Only update DOM when values actually change
    const newLeft = (worldPixels.x + offset) + 'px';
    const newTop = (worldPixels.y + offset) + 'px';
    const newWidth = squareSize + 'px';
    const newHeight = squareSize + 'px';
    const newTransform = `scale(${scaleX}, ${scaleY})`;
    
    if (redSquare.style.width !== newWidth) {
        redSquare.style.width = newWidth;
    }
    if (redSquare.style.height !== newHeight) {
        redSquare.style.height = newHeight;
    }
    if (redSquare.style.left !== newLeft) {
        redSquare.style.left = newLeft;
    }
    if (redSquare.style.top !== newTop) {
        redSquare.style.top = newTop;
    }
    if (redSquare.style.transform !== newTransform) {
        redSquare.style.transform = newTransform;
        redSquare.style.transformOrigin = 'center center';
    }
    
    // Update mana cast bar
    if (gameState.isCastingMana) {
        const currentTime = performance.now() / 1000;
        const castProgress = Math.min(1.0, Math.max(0.0, (currentTime - (gameState.manaCastEndTime - MANA_CAST_TIME)) / MANA_CAST_TIME));
        
        // Position cast bar above player
        const playerLeft = worldPixels.x + offset;
        const playerTop = worldPixels.y + offset;
        const barOffset = 8; // Distance above player
        
        manaCastBar.style.display = 'block';
        manaCastBar.style.width = squareSize + 'px';
        manaCastBar.style.left = playerLeft + 'px';
        manaCastBar.style.top = (playerTop - barOffset) + 'px';
        
        // Update fill width based on cast progress
        manaCastFill.style.width = (castProgress * 100) + '%';
    } else {
        manaCastBar.style.display = 'none';
    }
    
    // Update health dots for local player
    updateHealthDots(playerHealthDots, gameState.health, gameState.maxHealth, worldPixels.x + offset, worldPixels.y + offset, squareSize);
}

// Update health dots display
// Performance optimization: Track last values per container to avoid unnecessary updates
const healthDotsCache = new WeakMap(); // container -> {lastHealth, lastLeft, lastTop, lastSize}

function updateHealthDots(healthDotsContainer, health, maxHealth, playerLeft, playerTop, playerSize) {
    if (!healthDotsContainer) return;
    
    // Get cached values for this container
    let cache = healthDotsCache.get(healthDotsContainer);
    if (!cache) {
        cache = { lastHealth: -1, lastLeft: -1, lastTop: -1, lastSize: -1 };
        healthDotsCache.set(healthDotsContainer, cache);
    }
    
    // Only update if health or position changed (performance optimization)
    const healthChanged = cache.lastHealth !== health;
    const positionChanged = Math.abs(cache.lastLeft - playerLeft) > 0.1 || 
                           Math.abs(cache.lastTop - playerTop) > 0.1 ||
                           Math.abs(cache.lastSize - playerSize) > 0.1;
    
    if (!healthChanged && !positionChanged) {
        return; // Skip update if nothing changed
    }
    
    const dots = healthDotsContainer.querySelectorAll('.health-dot');
    const dotOffset = 12; // Distance above player (above mana cast bar)
    const dotSpacing = 5; // Space between dots
    const dotSize = 6; // Size of each dot
    
    // Position container above player, centered (only update if position changed)
    if (positionChanged) {
        const containerWidth = (dotSize * 3) + (dotSpacing * 2);
        healthDotsContainer.style.left = (playerLeft + (playerSize / 2) - (containerWidth / 2)) + 'px';
        healthDotsContainer.style.top = (playerTop - dotOffset) + 'px';
        healthDotsContainer.style.width = containerWidth + 'px';
        healthDotsContainer.style.display = 'flex';
        cache.lastLeft = playerLeft;
        cache.lastTop = playerTop;
        cache.lastSize = playerSize;
    }
    
    // Update each dot based on health (always update if health changed)
    if (healthChanged) {
        dots.forEach((dot, index) => {
            if (index < health) {
                dot.style.opacity = '1';
            } else {
                dot.style.opacity = '0.3';
            }
        });
        cache.lastHealth = health;
    }
}

// Force health dots update (bypasses cache to ensure immediate update)
function forceUpdateHealthDots(player) {
    if (!player || !player.healthDots) return;
    
    // Clear cache to force update
    const cache = healthDotsCache.get(player.healthDots);
    if (cache) {
        cache.lastHealth = -1; // Force health update
    }
    
    // Update immediately
    const worldPixels = gridToWorldPixels(player.interpolatedX, player.interpolatedY);
    const squareSize = Math.round(tileSize * PLAYER_SIZE);
    const offset = Math.round((tileSize - squareSize) / 2);
    updateHealthDots(player.healthDots, player.health, player.maxHealth, 
                     worldPixels.x + offset, worldPixels.y + offset, squareSize);
}

// Flash effect on player when they're hit
function triggerOtherPlayerDamageEffect(playerId) {
    const player = otherPlayers.get(playerId);
    if (!player || !player.element) return;
    
    // Add flash class
    player.element.classList.add('damage-flash');
    
    // Remove after animation
    setTimeout(() => {
        if (player && player.element) {
            player.element.classList.remove('damage-flash');
        }
    }, 200);
}

// Hit feedback (can be extended with particles, sounds, etc.)
function triggerHitFeedback(otherPlayerId, otherX, otherY, isBeingHit) {
    if (!viewport || !damageOverlay) return;
    
    if (isBeingHit) {
        // You were hit - damage effect already handled by triggerDamageEffect
        // This is just for additional feedback if needed
    } else {
        // You hit someone - show attack visual effect
        // White/yellow flash to indicate successful hit
        damageOverlay.style.backgroundColor = 'rgba(255, 255, 200, 0.5)';
        
        // Remove flash after brief duration
        setTimeout(() => {
            if (damageOverlay) {
                damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0)';
            }
        }, 150);
    }
}

function renderOtherPlayers() {
    for (const [playerId, player] of otherPlayers.entries()) {
        if (!player.element) continue;
        
        // Convert interpolated grid coordinates to world pixels
        const worldPixels = gridToWorldPixels(player.interpolatedX, player.interpolatedY);
        
        // Set size based on PLAYER_SIZE variable
        const squareSize = Math.round(tileSize * PLAYER_SIZE);
        const offset = Math.round((tileSize - squareSize) / 2);
        
        // Calculate squash and stretch based on movement (CLIENT-SIDE ONLY - saves bandwidth)
        // Server only sends position data (x, y, targetX, targetY)
        // Movement direction and animation intensity calculated locally from position changes
        let scaleX = 1.0;
        let scaleY = 1.0;
        
        if (player.lastMovementDirection) {
            const playerDiffX = player.targetX - player.interpolatedX;
            const playerDiffY = player.targetY - player.interpolatedY;
                // Performance optimization: Use squared distance for comparison, only sqrt when needed
            const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
            const playerDistance = Math.sqrt(playerDistanceSquared);
            
            const movementIntensity = Math.min(playerDistance, 1.0);
            const stretchAmount = movementIntensity * SQUASH_STRETCH_INTENSITY;
            const squashAmount = movementIntensity * (SQUASH_STRETCH_INTENSITY * 0.67);
            
            switch (player.lastMovementDirection) {
                case 'LEFT':
                case 'RIGHT':
                    scaleX = 1.0 + stretchAmount;
                    scaleY = 1.0 - squashAmount;
                    break;
                case 'UP':
                case 'DOWN':
                    scaleX = 1.0 - squashAmount;
                    scaleY = 1.0 + stretchAmount;
                    break;
            }
        }
        
        // Apply jelly wobble effect (CLIENT-SIDE ONLY - saves bandwidth)
        // Wobble animation calculated locally when movement completes
        // No wobble state sent from server - purely visual effect
        if (player.wobbleStartTime !== null) {
            const currentTime = performance.now();
            const wobbleAge = (currentTime - player.wobbleStartTime) / 1000;
            
            if (wobbleAge < JELLY_WOBBLE_DURATION) {
                const decay = 1.0 - (wobbleAge / JELLY_WOBBLE_DURATION);
                const wobbleX = Math.sin(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
                const wobbleY = Math.cos(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
                scaleX += wobbleX;
                scaleY += wobbleY;
            } else {
                player.wobbleStartTime = null;
            }
        }
        
        // Position relative to world container
        // Performance optimization: Only update DOM when values actually change
        const newLeft = (worldPixels.x + offset) + 'px';
        const newTop = (worldPixels.y + offset) + 'px';
        const newWidth = squareSize + 'px';
        const newHeight = squareSize + 'px';
        const newTransform = `scale(${scaleX}, ${scaleY})`;
        
        // Track last render values per player (store in player object)
        if (!player._lastRender) {
            player._lastRender = { width: '', height: '', left: '', top: '', transform: '' };
        }
        
        if (player.element.style.width !== newWidth) {
            player.element.style.width = newWidth;
            player._lastRender.width = newWidth;
        }
        if (player.element.style.height !== newHeight) {
            player.element.style.height = newHeight;
            player._lastRender.height = newHeight;
        }
        if (player.element.style.left !== newLeft) {
            player.element.style.left = newLeft;
            player._lastRender.left = newLeft;
        }
        if (player.element.style.top !== newTop) {
            player.element.style.top = newTop;
            player._lastRender.top = newTop;
        }
        if (player.element.style.transform !== newTransform) {
            player.element.style.transform = newTransform;
            player.element.style.transformOrigin = 'center center';
            player._lastRender.transform = newTransform;
        }
        
        // Update health dots for other player
        if (player.healthDots) {
            updateHealthDots(player.healthDots, player.health, player.maxHealth, worldPixels.x + offset, worldPixels.y + offset, squareSize);
        }
        
        // Update mana cast bar for other player
        if (player.manaCastBar && player.manaCastFill) {
            const currentTime = performance.now() / 1000;
            const playerLeft = worldPixels.x + offset;
            const playerTop = worldPixels.y + offset;
            const barOffset = 8; // Distance above player
            
            if (player.isCastingMana && player.manaCastEndTime > 0) {
                // Calculate cast progress
                const castProgress = Math.min(1.0, Math.max(0.0, (currentTime - (player.manaCastEndTime - MANA_CAST_TIME)) / MANA_CAST_TIME));
                
                player.manaCastBar.style.display = 'block';
                player.manaCastBar.style.width = squareSize + 'px';
                player.manaCastBar.style.left = playerLeft + 'px';
                player.manaCastBar.style.top = (playerTop - barOffset) + 'px';
                
                // Update fill width based on cast progress
                player.manaCastFill.style.width = (castProgress * 100) + '%';
            } else {
                player.manaCastBar.style.display = 'none';
            }
        }
    }
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function handleKeyPress(event) {
    // Don't interfere if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement && activeElement.isContentEditable)) {
        // User is typing in an input field, don't interfere
        return;
    }
    
    // Only process game keys when viewport is focused
    if (activeElement !== viewport) {
        return;
    }
    
    const key = event.key.toLowerCase();
    
    // Handle dash ability
    if (key === 'i') {
        event.preventDefault();
        event.stopPropagation();
        handleDash();
        return;
    }
    
    // Handle mana ability
    if (key === 'l') {
        event.preventDefault();
        event.stopPropagation();
        handleMana();
        return;
    }
    
    // Debug: Lose health when pressing U
    if (key === 'u') {
        event.preventDefault();
        event.stopPropagation();
        // updateHealthBar will detect the health decrease and trigger damage effect
        gameState.health = Math.max(0, gameState.health - 1);
        updateHealthBar();
        // Send to server if connected
        if (isConnected && socket) {
            socket.emit('updateHealth', gameState.health);
        }
        return;
    }
    
    const action = INPUT_MAP[key];
    
    if (action) {
        // Prevent default browser behavior for game keys
        event.preventDefault();
        event.stopPropagation();
        
        // Track that this key is being held
        gameState.pressedKeys.add(key);
        
        handleAction(action);
    }
}

function handleKeyRelease(event) {
    // Don't interfere if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement && activeElement.isContentEditable)) {
        // User is typing in an input field, don't interfere
        return;
    }
    
    // Only process game keys when viewport is focused
    if (activeElement !== viewport) {
        return;
    }
    
    const key = event.key.toLowerCase();
    const action = INPUT_MAP[key];
    
    if (action) {
        // Prevent default browser behavior for game keys
        event.preventDefault();
        event.stopPropagation();
        
        // Remove key from pressed keys
        gameState.pressedKeys.delete(key);
        
        // Don't clear movement queue if player is dashing - dash should complete
        if (!gameState.isDashing) {
            // Remove all instances of this action from the movement queue
            gameState.movementQueue = gameState.movementQueue.filter(a => a !== action);
            
            // If no keys are pressed and player is not currently moving, ensure we stop
            if (gameState.pressedKeys.size === 0) {
                // Clear any remaining queued movements
                gameState.movementQueue = [];
            }
        }
    }
}

function handleAction(action) {
    // Don't allow movement while casting mana
    if (gameState.isCastingMana) {
        return;
    }
    
    // Check if player is currently moving
    const playerDiffX = gameState.playerTarget.x - gameState.playerInterpolated.x;
    const playerDiffY = gameState.playerTarget.y - gameState.playerInterpolated.y;
    // Performance optimization: Use squared distance for comparison (0.01^2 = 0.0001)
    const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
    const isCurrentlyMoving = playerDistanceSquared > 0.0001; // Equivalent to distance > 0.01
    
    if (isCurrentlyMoving) {
        // If currently moving, add to queue (max 2 items)
        // Only add if not already in queue to prevent duplicates
        if (gameState.movementQueue.length < 2 && !gameState.movementQueue.includes(action)) {
            gameState.movementQueue.push(action);
        }
    } else {
        // If not moving, execute immediately
        executeMovement(action);
    }
}

function queueMovementFromPressedKeys() {
    // Don't allow movement while casting mana
    if (gameState.isCastingMana) {
        return;
    }
    
    // Convert pressed keys to actions and queue them
    // This allows continuous movement when keys are held without key repeat delay
    for (const key of gameState.pressedKeys) {
        const action = INPUT_MAP[key];
        if (action) {
            // Only queue if not already queued and queue has space
            if (!gameState.movementQueue.includes(action) && gameState.movementQueue.length < 2) {
                gameState.movementQueue.push(action);
            }
        }
    }
    
    // Process the first queued movement immediately if we queued something
    if (gameState.movementQueue.length > 0) {
        processNextMovement();
    }
}

// ============================================================================
// STARTUP
// ============================================================================

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

// Also ensure window focus
window.addEventListener('focus', () => {
    console.log('Window gained focus');
});

window.addEventListener('blur', () => {
    console.log('Window lost focus');
});
