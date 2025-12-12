// ============================================================================
// CAMERA SYSTEM
// ============================================================================

import { gameState } from './gameState.js';
import { WORLD_WIDTH, WORLD_HEIGHT, CAMERA_ARRIVAL_TIME } from './config.js';

let viewport;
let tileSize = 0;

export function initCamera(viewportElement, currentTileSize) {
    viewport = viewportElement;
    tileSize = currentTileSize;
}

export function updateTileSize(newTileSize) {
    tileSize = newTileSize;
}

// Get viewport dimensions in tiles
function getViewportTiles() {
    return {
        x: viewport.clientWidth / tileSize,
        y: viewport.clientHeight / tileSize
    };
}

// Center camera on a position
function centerCameraOnPosition(posX, posY) {
    const tiles = getViewportTiles();
    gameState.cameraTarget.x = posX - (tiles.x / 2);
    gameState.cameraTarget.y = posY - (tiles.y / 2);
    clampCameraTarget();
}

export function centerCameraOnRedSquare() {
    if (gameState.isHitEffectActive) return;
    
    const playerX = gameState.isDashing ? gameState.playerInterpolated.x : gameState.player.x;
    const playerY = gameState.isDashing ? gameState.playerInterpolated.y : gameState.player.y;
    centerCameraOnPosition(playerX, playerY);
}

export function moveCameraToPosition(targetX, targetY) {
    centerCameraOnPosition(targetX, targetY);
}

// Trigger camera effect when hitting an enemy or being hit
export function triggerHitCameraEffect(enemyX, enemyY, bumpAway = false) {
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
    
    // Bump camera in hit direction
    const bumpedCenterX = playerX + bumpX * BUMP_DISTANCE;
    const bumpedCenterY = playerY + bumpY * BUMP_DISTANCE;
    centerCameraOnPosition(bumpedCenterX, bumpedCenterY);
    
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

export function clampCameraTarget() {
    const tiles = getViewportTiles();
    const maxCameraX = WORLD_WIDTH - tiles.x;
    const maxCameraY = WORLD_HEIGHT - tiles.y;
    
    gameState.cameraTarget.x = Math.max(0, Math.min(maxCameraX, gameState.cameraTarget.x));
    gameState.cameraTarget.y = Math.max(0, Math.min(maxCameraY, gameState.cameraTarget.y));
}

// Get camera interpolated position
export function getCameraInterpolated() {
    return gameState.cameraInterpolated;
}

// Get camera target
export function getCameraTarget() {
    return gameState.cameraTarget;
}

