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
    // Steepen the curve for a more apparent ease out by increasing the exponent
    return 1 - Math.pow(1 - t, 5);
}

