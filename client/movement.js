// ============================================================================
// CLIENT MOVEMENT PROCESSING
// ============================================================================

import { gameState } from './gameState.js';
import { WORLD_WIDTH, WORLD_HEIGHT, CLIENT_MOVE_RATE_LIMIT } from './config.js';
import { isWall } from './map.js';
import { centerCameraOnRedSquare } from './camera.js';
import { emitMove, getNetworkState } from './network.js';

// Client-side input rate limiting
let lastClientMoveTime = 0;
let clientMoveCount = 0;
let clientMoveCountResetTime = performance.now();

export function processNextMovement() {
    // If there are queued movements, process the next one
    if (gameState.movementQueue.length > 0) {
        const action = gameState.movementQueue.shift(); // Remove and get first item
        executeMovement(action);
    }
}

export function executeMovement(action) {
    // Don't allow movement while dead
    if (gameState.isDead) {
        return;
    }
    
    // Check if dashing and block movement in other directions
    const currentTime = performance.now() / 1000;
    const isDashing = gameState.dashEndTime && gameState.dashEndTime > currentTime;
    if (isDashing && gameState.dashDirection && action !== gameState.dashDirection) {
        // Block movement in directions other than dash direction
        return;
    }
    
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
        // Wall or out of bounds - don't allow movement, try next in queue
        processNextMovement();
        return;
    }
    
    // If connected to server, send movement to server
    const networkState = getNetworkState();
    if (networkState.isConnected && networkState.socket) {
        // Client-side rate limiting to prevent spam
        const now = performance.now();
        const currentTime = now / 1000;
        
        // Check if player is dashing (has active dash speed boost)
        const isDashing = gameState.dashEndTime && gameState.dashEndTime > currentTime;
        
        // During dash, allow 4x faster movement (reduce rate limit by 4x)
        const effectiveRateLimit = isDashing ? CLIENT_MOVE_RATE_LIMIT / 4 : CLIENT_MOVE_RATE_LIMIT;
        
        if (now - clientMoveCountResetTime >= 1000) {
            clientMoveCount = 0;
            clientMoveCountResetTime = now;
        }
        if (clientMoveCount >= 10) {
            // Too many moves, ignore this one
            return;
        }
        if (now - lastClientMoveTime < effectiveRateLimit) {
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
        
        emitMove(action);
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

