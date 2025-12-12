// ============================================================================
// ANIMATION LOOP
// ============================================================================

import { gameState } from './gameState.js';
import { BASE_ANIMATION_SPEED, DASH_SPEED, TRANSITION_THRESHOLD, WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { isWall, clampInterpolatedPosition } from './map.js';
import { easeOutCubic, getCurrentTime, getMovementDirection } from './utils.js';
import { centerCameraOnRedSquare } from './camera.js';
import { updateDashCooldownBar, updateHealthBar, updateManaBar, checkManaCastComplete } from './abilities.js';
import { otherPlayers } from './player.js';
import { setPreviousHealth } from './gameState.js';
import { getPreviousHealth } from './gameState.js';

let viewport, tileSize;
let lastFrameTime = performance.now();
let animationFrameId = null;

// Callbacks (will be set by main script)
let processNextMovement, queueMovementFromPressedKeys, render, executeMovement;

export function initAnimation(viewportElement, currentTileSize, callbacks) {
    viewport = viewportElement;
    tileSize = currentTileSize;
    processNextMovement = callbacks.processNextMovement;
    queueMovementFromPressedKeys = callbacks.queueMovementFromPressedKeys;
    render = callbacks.render;
    executeMovement = callbacks.executeMovement;
}

export function updateTileSize(newTileSize) {
    tileSize = newTileSize;
}

export function startAnimationLoop() {
    lastFrameTime = performance.now();
    function animate() {
        updateAnimations();
        if (render) render();
        animationFrameId = requestAnimationFrame(animate);
    }
    animate();
}

export function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function updateAnimations() {
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - lastFrameTime) / 1000, 0.1);
    lastFrameTime = currentTime;
    const currentTimeSeconds = currentTime / 1000;
    
    updateDashCooldownBar();
    
    let currentPreviousHealth = getPreviousHealth();
    const healthUpdated = checkManaCastComplete(currentPreviousHealth);
    if (healthUpdated) {
        setPreviousHealth(gameState.health);
        currentPreviousHealth = gameState.health;
    }
    
    updateHealthBar(currentPreviousHealth);
    
    updateManaBar();
    
    // Player movement interpolation
    const playerDiffX = gameState.playerTarget.x - gameState.playerInterpolated.x;
    const playerDiffY = gameState.playerTarget.y - gameState.playerInterpolated.y;
    const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
    const playerDistance = Math.sqrt(playerDistanceSquared);
    
        if (playerDistance < 0.01) {
        gameState.playerInterpolated.x = gameState.playerTarget.x;
        gameState.playerInterpolated.y = gameState.playerTarget.y;
        
        // Check if dash has expired
        if (gameState.dashEndTime && gameState.dashEndTime <= currentTimeSeconds) {
            gameState.isDashing = false;
            gameState.dashEndTime = 0;
            gameState.dashDirection = null;
            gameState.dashQueue = [];
        }
        
        if (gameState.lastMovementDirection !== null && gameState.wobbleStartTime === null) {
            gameState.wobbleStartTime = currentTime;
        }
        
        gameState.lastMovementDirection = null;
        
        if (!gameState.isCastingMana) {
            // Process dash queue first (dash movements take priority)
            if (gameState.dashQueue.length > 0 && executeMovement) {
                const dashAction = gameState.dashQueue[0]; // Peek at first item
                // Execute dash movement immediately (it will be removed from queue after completion)
                executeMovement(dashAction);
            } else if (gameState.movementQueue.length > 0 && processNextMovement) {
                processNextMovement();
            } else if (gameState.pressedKeys.size > 0 && queueMovementFromPressedKeys) {
                queueMovementFromPressedKeys();
            }
        }
    } else {
        gameState.lastMovementDirection = getMovementDirection(playerDiffX, playerDiffY);
        
        gameState.wobbleStartTime = null;
        
        // Check if dash is still active
        const isDashing = gameState.dashEndTime && gameState.dashEndTime > currentTimeSeconds;
        
        // During dash, use higher transition threshold for faster chaining
        const effectiveTransitionThreshold = isDashing ? 0.3 : TRANSITION_THRESHOLD;
        
        // Process dash queue during movement if close enough to target
        if (isDashing && gameState.dashQueue.length > 0 && executeMovement && playerDistance < effectiveTransitionThreshold) {
            const dashAction = gameState.dashQueue[0];
            executeMovement(dashAction);
        }
        
        if (playerDistance < effectiveTransitionThreshold && gameState.movementQueue.length > 0 && processNextMovement) {
            processNextMovement();
        }
        
        const currentSpeed = isDashing ? DASH_SPEED : BASE_ANIMATION_SPEED;
        const moveAmount = currentSpeed * deltaTime;
        const progress = Math.min(moveAmount / playerDistance, 1);
        const easedProgress = easeOutCubic(progress);
        
        const newInterpolatedX = gameState.playerInterpolated.x + playerDiffX * easedProgress;
        const newInterpolatedY = gameState.playerInterpolated.y + playerDiffY * easedProgress;
        
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
        
        if (isWall(gameState.player.x, gameState.player.y)) {
            if (!isWall(gameState.playerTarget.x, gameState.playerTarget.y)) {
                gameState.player.x = gameState.playerTarget.x;
                gameState.player.y = gameState.playerTarget.y;
                gameState.playerInterpolated.x = gameState.playerTarget.x;
                gameState.playerInterpolated.y = gameState.playerTarget.y;
            }
        }
        
        if (isWall(gameState.playerTarget.x, gameState.playerTarget.y)) {
            gameState.playerTarget.x = gameState.player.x;
            gameState.playerTarget.y = gameState.player.y;
            gameState.playerInterpolated.x = gameState.player.x;
            gameState.playerInterpolated.y = gameState.player.y;
        }
    }
    
    // Update camera target during dash
    const isDashingForCamera = gameState.dashEndTime && gameState.dashEndTime > currentTimeSeconds;
    if (isDashingForCamera && !gameState.isHitEffectActive) {
        centerCameraOnRedSquare();
    }
    
    // Camera interpolation
    const cameraDiffX = gameState.cameraTarget.x - gameState.cameraInterpolated.x;
    const cameraDiffY = gameState.cameraTarget.y - gameState.cameraInterpolated.y;
    const cameraDistanceSquared = cameraDiffX * cameraDiffX + cameraDiffY * cameraDiffY;
    const cameraDistance = Math.sqrt(cameraDistanceSquared);
    
    if (cameraDistance > 0.001) {
        const requiredSpeed = cameraDistance / gameState.cameraArrivalTime;
        const cameraMoveAmount = requiredSpeed * deltaTime;
        const progress = Math.min(cameraMoveAmount / cameraDistance, 1);
        const easedProgress = easeOutCubic(progress);
        
        gameState.cameraInterpolated.x += cameraDiffX * easedProgress;
        gameState.cameraInterpolated.y += cameraDiffY * easedProgress;
        
        if (cameraDistance < 0.01) {
            gameState.cameraInterpolated.x = gameState.cameraTarget.x;
            gameState.cameraInterpolated.y = gameState.cameraTarget.y;
        }
    }
    
    gameState.camera.x = gameState.cameraInterpolated.x;
    gameState.camera.y = gameState.cameraInterpolated.y;
    
    // Interpolate other players
    for (const [playerId, player] of otherPlayers.entries()) {
        const diffX = player.targetX - player.interpolatedX;
        const diffY = player.targetY - player.interpolatedY;
        const distanceSquared = diffX * diffX + diffY * diffY;
        const distance = Math.sqrt(distanceSquared);
        
        if (distance < 0.01) {
            player.interpolatedX = player.targetX;
            player.interpolatedY = player.targetY;
            
            if (player.lastMovementDirection !== null && player.wobbleStartTime === null) {
                player.wobbleStartTime = currentTime;
            }
            player.lastMovementDirection = null;
        } else {
            player.lastMovementDirection = getMovementDirection(diffX, diffY);
            
            player.wobbleStartTime = null;
            
            // Check if other player is dashing
            const otherPlayerIsDashing = player.dashEndTime && player.dashEndTime > currentTimeSeconds;
            const otherPlayerSpeed = otherPlayerIsDashing ? DASH_SPEED : BASE_ANIMATION_SPEED;
            
            const moveAmount = otherPlayerSpeed * deltaTime;
            const progress = Math.min(moveAmount / distance, 1);
            const easedProgress = easeOutCubic(progress);
            
            const newInterpolatedX = player.interpolatedX + diffX * easedProgress;
            const newInterpolatedY = player.interpolatedY + diffY * easedProgress;
            
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
        
        if (player.isCastingMana && player.manaCastEndTime <= currentTimeSeconds) {
            player.isCastingMana = false;
        }
        
        if (player.dashCooldownEndTime > 0 && player.dashCooldownEndTime <= currentTimeSeconds) {
            player.dashCooldownEndTime = 0;
        }
    }
}



