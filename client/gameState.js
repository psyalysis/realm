// ============================================================================
// GAME STATE MANAGEMENT
// ============================================================================

import { WORLD_WIDTH, WORLD_HEIGHT } from './config.js';

// Game State - All positions in grid coordinates
export const gameState = {
    player: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
    playerTarget: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
    playerInterpolated: { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) },
    camera: { x: 0, y: 0 },
    cameraTarget: { x: 0, y: 0 },
    cameraInterpolated: { x: 0, y: 0 },
    cameraArrivalTime: 1,
    isHitEffectActive: false,
    zoom: 4.0,
    movementQueue: [],
    lastMovementDirection: null,
    wobbleStartTime: null,
    pressedKeys: new Set(),
    dashCooldownEndTime: 0,
    dashEndTime: 0, // When dash speed boost ends
    dashDirection: null, // Locked direction during dash (MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT)
    isDashing: false,
    health: 3,
    maxHealth: 3,
    manaCooldownEndTime: 0,
    isCastingMana: false,
    manaCastEndTime: 0,
    isDead: false,
    respawnTime: 0,
    playerColor: null
};

// Performance optimization: Track last values to avoid unnecessary updates
export const performanceCache = {
    lastDashCooldownFill: -1,
    lastHealthFill: -1,
    lastManaFill: -1,
    lastCameraX: -Infinity,
    lastCameraY: -Infinity,
    lastCameraZoom: -1,
    lastTileSize: 0,
    lastPlayerRender: {
        width: -1,
        height: -1,
        left: -1,
        top: -1,
        transform: ''
    }
};

// Track previous health to detect damage
let previousHealth = 3;
export function setPreviousHealth(value) {
    previousHealth = value;
}
export function getPreviousHealth() {
    return previousHealth;
}

