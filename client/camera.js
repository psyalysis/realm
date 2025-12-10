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

export function centerCameraOnRedSquare() {
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
export function moveCameraToPosition(targetX, targetY) {
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

export function clampCameraTarget() {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    const tilesVisibleX = viewportWidth / tileSize;
    const tilesVisibleY = viewportHeight / tileSize;
    
    const maxCameraX = WORLD_WIDTH - tilesVisibleX;
    const maxCameraY = WORLD_HEIGHT - tilesVisibleY;
    
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

