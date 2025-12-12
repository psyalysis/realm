// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Convert grid coordinates to world pixel coordinates
export function gridToWorldPixels(gridX, gridY, tileSize) {
    return {
        x: gridX * tileSize,
        y: gridY * tileSize
    };
}

// Convert world pixel coordinates to grid coordinates
export function worldPixelsToGrid(pixelX, pixelY, tileSize) {
    return {
        x: Math.floor(pixelX / tileSize),
        y: Math.floor(pixelY / tileSize)
    };
}

// Convert world pixel coordinates to viewport pixel coordinates
export function worldToViewport(worldX, worldY, cameraInterpolated, tileSize) {
    const cameraWorldPixels = gridToWorldPixels(cameraInterpolated.x, cameraInterpolated.y, tileSize);
    return {
        x: worldX - cameraWorldPixels.x,
        y: worldY - cameraWorldPixels.y
    };
}

// Easing function for smooth deceleration (ease-out cubic)
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 5);
}

// Convert server timestamp to client-relative time
export function serverTimeToClient(serverTime) {
    if (serverTime <= 0) return 0;
    const now = performance.now() / 1000;
    const serverNow = Date.now() / 1000;
    const timeUntil = serverTime - serverNow;
    return now + Math.max(0, timeUntil);
}

// Get current time in seconds
export function getCurrentTime() {
    return performance.now() / 1000;
}

// Update DOM element style only if value changed
export function updateStyle(element, property, value) {
    if (element && element.style[property] !== value) {
        element.style[property] = value;
    }
}

// Calculate movement direction from differences
export function getMovementDirection(diffX, diffY) {
    if (Math.abs(diffX) > Math.abs(diffY)) {
        return diffX > 0 ? 'RIGHT' : 'LEFT';
    }
    return diffY > 0 ? 'DOWN' : 'UP';
}

// Calculate squash/stretch scale factors
export function calculateSquashStretch(distance, direction, squashStretchIntensity = 0.7) {
    const movementIntensity = Math.min(distance, 1.0);
    const stretchAmount = movementIntensity * squashStretchIntensity;
    const squashAmount = movementIntensity * (squashStretchIntensity * 0.67);
    
    let scaleX = 1.0;
    let scaleY = 1.0;
    
    switch (direction) {
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
    
    return { scaleX, scaleY };
}

