// ============================================================================
// INPUT HANDLING
// ============================================================================

import { gameState } from './gameState.js';
import { INPUT_MAP } from './config.js';
import { handleDash, handleMana, updateHealthBar } from './abilities.js';

let viewport;
let socket, isConnected;

export function initInput(viewportElement, networkState) {
    viewport = viewportElement;
    socket = networkState.socket;
    isConnected = networkState.isConnected;
}

export function updateNetworkState(networkState) {
    socket = networkState.socket;
    isConnected = networkState.isConnected;
}

// Movement execution (will be provided by movement module)
let executeMovement, processNextMovement;

export function setMovementFunctions(executeFn, processNextFn) {
    executeMovement = executeFn;
    processNextMovement = processNextFn;
}

export function handleKeyPress(event) {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement && activeElement.isContentEditable)) {
        return;
    }
    
    if (activeElement !== viewport) {
        return;
    }
    
    const key = event.key.toLowerCase();
    
    if (key === 'i') {
        event.preventDefault();
        event.stopPropagation();
        if (!gameState.isDead) {
            handleDash();
        }
        return;
    }
    
    if (key === 'l') {
        event.preventDefault();
        event.stopPropagation();
        if (!gameState.isDead) {
            handleMana();
        }
        return;
    }
    
    // Debug: Lose health when pressing U
    if (key === 'u') {
        event.preventDefault();
        event.stopPropagation();
        gameState.health = Math.max(0, gameState.health - 1);
        updateHealthBar();
        if (isConnected && socket) {
            socket.emit('updateHealth', gameState.health);
        }
        return;
    }
    
    const action = INPUT_MAP[key];
    
    if (action) {
        event.preventDefault();
        event.stopPropagation();
        gameState.pressedKeys.add(key);
        handleAction(action);
    }
}

export function handleKeyRelease(event) {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement && activeElement.isContentEditable)) {
        return;
    }
    
    if (activeElement !== viewport) {
        return;
    }
    
    const key = event.key.toLowerCase();
    const action = INPUT_MAP[key];
    
    if (action) {
        event.preventDefault();
        event.stopPropagation();
        gameState.pressedKeys.delete(key);
        
        // Check if dashing and block removal of dash direction from queue
        const currentTime = performance.now() / 1000;
        const isDashing = gameState.dashEndTime && gameState.dashEndTime > currentTime;
        
        if (!isDashing) {
            gameState.movementQueue = gameState.movementQueue.filter(a => a !== action);
            
            if (gameState.pressedKeys.size === 0) {
                gameState.movementQueue = [];
            }
        } else {
            // During dash, only allow removing non-dash-direction actions
            if (action !== gameState.dashDirection) {
                gameState.movementQueue = gameState.movementQueue.filter(a => a !== action);
            }
        }
    }
}

function handleAction(action) {
    // Don't allow movement while dead
    if (gameState.isDead) {
        return;
    }
    
    // Don't allow movement while casting mana
    if (gameState.isCastingMana) {
        return;
    }
    
    // Check if dashing and block movement in other directions
    const currentTime = performance.now() / 1000;
    const isDashing = gameState.dashEndTime && gameState.dashEndTime > currentTime;
    if (isDashing && gameState.dashDirection && action !== gameState.dashDirection) {
        // Block movement in directions other than dash direction
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
        if (executeMovement) {
            executeMovement(action);
        }
    }
}

export function queueMovementFromPressedKeys() {
    if (gameState.isDead) {
        return;
    }
    
    if (gameState.isCastingMana) {
        return;
    }
    
    for (const key of gameState.pressedKeys) {
        const action = INPUT_MAP[key];
        if (action) {
            if (!gameState.movementQueue.includes(action) && gameState.movementQueue.length < 2) {
                gameState.movementQueue.push(action);
            }
        }
    }
    
    if (gameState.movementQueue.length > 0 && processNextMovement) {
        processNextMovement();
    }
}

