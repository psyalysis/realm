// ============================================================================
// RENDERING SYSTEM
// ============================================================================

import { gameState, performanceCache } from './gameState.js';
import { 
    WORLD_WIDTH, 
    WORLD_HEIGHT, 
    BACKGROUND_COLOR, 
    GRID_OPACITY, 
    GRID_THICKNESS, 
    WALL_CORNER_RADIUS,
    PLAYER_SIZE,
    SQUASH_STRETCH_INTENSITY,
    JELLY_WOBBLE_INTENSITY,
    JELLY_WOBBLE_FREQUENCY,
    JELLY_WOBBLE_DURATION,
    MANA_CAST_TIME
} from './config.js';
import { getMap, initEmptyMap } from './map.js';
import { gridToWorldPixels, worldToViewport } from './utils.js';
import { getCameraInterpolated } from './camera.js';
import { otherPlayers } from './player.js';

// DOM elements and state
let viewport, world, canvasGrid, ctx, redSquare, manaCastBar, manaCastFill, playerHealthDots, damageOverlay;
let tileSize = 0;

// Health dots cache
const healthDotsCache = new WeakMap();

export function initRenderer(elements, canvasContext, currentTileSize) {
    viewport = elements.viewport;
    world = elements.world;
    canvasGrid = elements.canvasGrid;
    ctx = canvasContext;
    redSquare = elements.redSquare;
    manaCastBar = elements.manaCastBar;
    manaCastFill = elements.manaCastFill;
    playerHealthDots = elements.playerHealthDots;
    damageOverlay = elements.damageOverlay;
    tileSize = currentTileSize;
}

export function updateTileSize(newTileSize) {
    tileSize = newTileSize;
}

export function render() {
    if (tileSize === 0) return;
    
    const map = getMap();
    if (!map || map.length === 0) {
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, viewportWidth, viewportHeight);
        return;
    }
    
    const worldWidthPixels = WORLD_WIDTH * tileSize;
    const worldHeightPixels = WORLD_HEIGHT * tileSize;
    
    if (world.style.width !== (worldWidthPixels + 'px')) {
        world.style.width = worldWidthPixels + 'px';
    }
    if (world.style.height !== (worldHeightPixels + 'px')) {
        world.style.height = worldHeightPixels + 'px';
    }
    
    const cameraInterpolated = getCameraInterpolated();
    const cameraWorldPixels = gridToWorldPixels(cameraInterpolated.x, cameraInterpolated.y, tileSize);
    const worldLeft = (-cameraWorldPixels.x) + 'px';
    const worldTop = (-cameraWorldPixels.y) + 'px';
    
    if (world.style.left !== worldLeft) {
        world.style.left = worldLeft;
    }
    if (world.style.top !== worldTop) {
        world.style.top = worldTop;
    }
    
    const cameraX = cameraInterpolated.x;
    const cameraY = cameraInterpolated.y;
    const cameraZoom = gameState.zoom;
    const needsMapRedraw = (
        Math.abs(cameraX - performanceCache.lastCameraX) > 0.01 ||
        Math.abs(cameraY - performanceCache.lastCameraY) > 0.01 ||
        Math.abs(cameraZoom - performanceCache.lastCameraZoom) > 0.01 ||
        tileSize !== performanceCache.lastTileSize
    );
    
    if (needsMapRedraw) {
        drawMap(ctx, map);
        performanceCache.lastCameraX = cameraX;
        performanceCache.lastCameraY = cameraY;
        performanceCache.lastCameraZoom = cameraZoom;
        performanceCache.lastTileSize = tileSize;
    }
    
    renderRedSquare();
    renderOtherPlayers();
}

function drawMap(ctx, map) {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    
    if (!map || map.length === 0 || !map[0] || map[0].length === 0) {
        return;
    }
    
    const cameraInterpolated = getCameraInterpolated();
    const startX = Math.max(0, Math.floor(cameraInterpolated.x));
    const startY = Math.max(0, Math.floor(cameraInterpolated.y));
    const endX = Math.min(WORLD_WIDTH, Math.ceil(cameraInterpolated.x + (viewportWidth / tileSize)));
    const endY = Math.min(WORLD_HEIGHT, Math.ceil(cameraInterpolated.y + (viewportHeight / tileSize)));
    
    for (let gridY = startY; gridY < endY; gridY++) {
        if (gridY < 0 || gridY >= map.length || !map[gridY]) continue;
        
        for (let gridX = startX; gridX < endX; gridX++) {
            if (gridX < 0 || gridX >= map[gridY].length) continue;
            
            const worldPixels = gridToWorldPixels(gridX, gridY, tileSize);
            const viewportPixels = worldToViewport(worldPixels.x, worldPixels.y, cameraInterpolated, tileSize);
            
            if (viewportPixels.x + tileSize < 0 || viewportPixels.x > viewportWidth ||
                viewportPixels.y + tileSize < 0 || viewportPixels.y > viewportHeight) {
                continue;
            }
            
            const isWallCell = map[gridY][gridX];
            const baseX = Math.round(viewportPixels.x);
            const baseY = Math.round(viewportPixels.y);
            
            if (isWallCell) {
                ctx.fillStyle = 'black';
                drawWallCell(ctx, baseX, baseY, tileSize, tileSize, WALL_CORNER_RADIUS, gridX, gridY, map);
                ctx.fill();
            } else {
                ctx.fillStyle = BACKGROUND_COLOR;
                ctx.fillRect(baseX, baseY, tileSize, tileSize);
            }
            
            const hasTopWall = gridY > 0 && map[gridY - 1][gridX];
            const hasBottomWall = gridY < WORLD_HEIGHT - 1 && map[gridY + 1][gridX];
            const hasLeftWall = gridX > 0 && map[gridY][gridX - 1];
            const hasRightWall = gridX < WORLD_WIDTH - 1 && map[gridY][gridX + 1];
            
            if (!isWallCell || !hasTopWall || !hasBottomWall || !hasLeftWall || !hasRightWall) {
                ctx.strokeStyle = `rgba(0, 0, 0, ${GRID_OPACITY})`;
                ctx.lineWidth = GRID_THICKNESS;
                ctx.beginPath();
                const x = baseX + (GRID_THICKNESS / 2);
                const y = baseY + (GRID_THICKNESS / 2);
                const size = tileSize - GRID_THICKNESS;
                
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

function drawWallCell(ctx, x, y, width, height, radius, gridX, gridY, map) {
    const hasTopWall = gridY > 0 && map[gridY - 1][gridX];
    const hasBottomWall = gridY < WORLD_HEIGHT - 1 && map[gridY + 1][gridX];
    const hasLeftWall = gridX > 0 && map[gridY][gridX - 1];
    const hasRightWall = gridX < WORLD_WIDTH - 1 && map[gridY][gridX + 1];
    
    const roundTopLeft = !hasTopWall && !hasLeftWall;
    const roundTopRight = !hasTopWall && !hasRightWall;
    const roundBottomLeft = !hasBottomWall && !hasLeftWall;
    const roundBottomRight = !hasBottomWall && !hasRightWall;
    
    const overlap = GRID_THICKNESS / 2 + 0.5;
    
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
    
    if (roundTopLeft) {
        ctx.moveTo(drawX + radius, drawY);
        ctx.lineTo(drawX + drawWidth - (roundTopRight ? radius : 0), drawY);
    } else {
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(drawX + drawWidth - (roundTopRight ? radius : 0), drawY);
    }
    
    if (roundTopRight) {
        ctx.quadraticCurveTo(drawX + drawWidth, drawY, drawX + drawWidth, drawY + radius);
    } else {
        ctx.lineTo(drawX + drawWidth, drawY);
    }
    
    ctx.lineTo(drawX + drawWidth, drawY + drawHeight - (roundBottomRight ? radius : 0));
    
    if (roundBottomRight) {
        ctx.quadraticCurveTo(drawX + drawWidth, drawY + drawHeight, drawX + drawWidth - radius, drawY + drawHeight);
    } else {
        ctx.lineTo(drawX + drawWidth, drawY + drawHeight);
    }
    
    ctx.lineTo(drawX + (roundBottomLeft ? radius : 0), drawY + drawHeight);
    
    if (roundBottomLeft) {
        ctx.quadraticCurveTo(drawX, drawY + drawHeight, drawX, drawY + drawHeight - radius);
    } else {
        ctx.lineTo(drawX, drawY + drawHeight);
    }
    
    ctx.lineTo(drawX, drawY + (roundTopLeft ? radius : 0));
    
    if (roundTopLeft) {
        ctx.quadraticCurveTo(drawX, drawY, drawX + radius, drawY);
    } else {
        ctx.lineTo(drawX, drawY);
    }
    
    ctx.closePath();
}

function renderRedSquare() {
    // Hide player cube when dead
    if (gameState.isDead) {
        if (redSquare.style.display !== 'none') {
            redSquare.style.display = 'none';
        }
        return;
    } else {
        if (redSquare.style.display !== 'block') {
            redSquare.style.display = 'block';
        }
    }
    
    const worldPixels = gridToWorldPixels(gameState.playerInterpolated.x, gameState.playerInterpolated.y, tileSize);
    const squareSize = Math.round(tileSize * PLAYER_SIZE);
    const offset = Math.round((tileSize - squareSize) / 2);
    
    let scaleX = 1.0;
    let scaleY = 1.0;
    
    if (gameState.lastMovementDirection) {
        const playerDiffX = gameState.playerTarget.x - gameState.playerInterpolated.x;
        const playerDiffY = gameState.playerTarget.y - gameState.playerInterpolated.y;
        const playerDistanceSquared = playerDiffX * playerDiffX + playerDiffY * playerDiffY;
        const playerDistance = Math.sqrt(playerDistanceSquared);
        const movementIntensity = Math.min(playerDistance, 1.0);
        const stretchAmount = movementIntensity * SQUASH_STRETCH_INTENSITY;
        const squashAmount = movementIntensity * (SQUASH_STRETCH_INTENSITY * 0.67);
        
        switch (gameState.lastMovementDirection) {
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
    
    if (gameState.wobbleStartTime !== null) {
        const currentTime = performance.now();
        const wobbleAge = (currentTime - gameState.wobbleStartTime) / 1000;
        
        if (wobbleAge < JELLY_WOBBLE_DURATION) {
            const decay = 1.0 - (wobbleAge / JELLY_WOBBLE_DURATION);
            const wobbleX = Math.sin(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
            const wobbleY = Math.cos(wobbleAge * JELLY_WOBBLE_FREQUENCY * Math.PI * 2) * JELLY_WOBBLE_INTENSITY * decay;
            scaleX += wobbleX;
            scaleY += wobbleY;
        } else {
            gameState.wobbleStartTime = null;
        }
    }
    
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
    
    if (gameState.isCastingMana) {
        const currentTime = performance.now() / 1000;
        const castProgress = Math.min(1.0, Math.max(0.0, (currentTime - (gameState.manaCastEndTime - MANA_CAST_TIME)) / MANA_CAST_TIME));
        const playerLeft = worldPixels.x + offset;
        const playerTop = worldPixels.y + offset;
        const barOffset = 8;
        
        manaCastBar.style.display = 'block';
        manaCastBar.style.width = squareSize + 'px';
        manaCastBar.style.left = playerLeft + 'px';
        manaCastBar.style.top = (playerTop - barOffset) + 'px';
        manaCastFill.style.width = (castProgress * 100) + '%';
    } else {
        manaCastBar.style.display = 'none';
    }
    
    // Hide health dots when dead
    if (gameState.isDead) {
        if (playerHealthDots.style.display !== 'none') {
            playerHealthDots.style.display = 'none';
        }
    } else {
        // updateHealthDots will set display to 'flex' when positioning
        updateHealthDots(playerHealthDots, gameState.health, gameState.maxHealth, worldPixels.x + offset, worldPixels.y + offset, squareSize);
    }
}

function renderOtherPlayers() {
    for (const [playerId, player] of otherPlayers.entries()) {
        if (!player.element) continue;
        
        // Hide player cube when dead
        if (player.isDead) {
            if (player.element.style.display !== 'none') {
                player.element.style.display = 'none';
            }
            continue;
        } else {
            if (player.element.style.display !== 'block') {
                player.element.style.display = 'block';
            }
        }
        
        const worldPixels = gridToWorldPixels(player.interpolatedX, player.interpolatedY, tileSize);
        const squareSize = Math.round(tileSize * PLAYER_SIZE);
        const offset = Math.round((tileSize - squareSize) / 2);
        
        let scaleX = 1.0;
        let scaleY = 1.0;
        
        if (player.lastMovementDirection) {
            const playerDiffX = player.targetX - player.interpolatedX;
            const playerDiffY = player.targetY - player.interpolatedY;
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
        
        const newLeft = (worldPixels.x + offset) + 'px';
        const newTop = (worldPixels.y + offset) + 'px';
        const newWidth = squareSize + 'px';
        const newHeight = squareSize + 'px';
        const newTransform = `scale(${scaleX}, ${scaleY})`;
        
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
        
        // Hide health dots when dead
        if (player.healthDots) {
            if (player.isDead) {
                if (player.healthDots.style.display !== 'none') {
                    player.healthDots.style.display = 'none';
                }
            } else {
                // updateHealthDots will set display to 'flex' when positioning
                updateHealthDots(player.healthDots, player.health, player.maxHealth, worldPixels.x + offset, worldPixels.y + offset, squareSize);
            }
        }
        
        if (player.manaCastBar && player.manaCastFill) {
            const currentTime = performance.now() / 1000;
            const playerLeft = worldPixels.x + offset;
            const playerTop = worldPixels.y + offset;
            const barOffset = 8;
            
            if (player.isCastingMana && player.manaCastEndTime > 0) {
                const castProgress = Math.min(1.0, Math.max(0.0, (currentTime - (player.manaCastEndTime - MANA_CAST_TIME)) / MANA_CAST_TIME));
                player.manaCastBar.style.display = 'block';
                player.manaCastBar.style.width = squareSize + 'px';
                player.manaCastBar.style.left = playerLeft + 'px';
                player.manaCastBar.style.top = (playerTop - barOffset) + 'px';
                player.manaCastFill.style.width = (castProgress * 100) + '%';
            } else {
                player.manaCastBar.style.display = 'none';
            }
        }
    }
}

function updateHealthDots(healthDotsContainer, health, maxHealth, playerLeft, playerTop, playerSize) {
    if (!healthDotsContainer) return;
    
    let cache = healthDotsCache.get(healthDotsContainer);
    if (!cache) {
        cache = { lastHealth: -1, lastLeft: -1, lastTop: -1, lastSize: -1 };
        healthDotsCache.set(healthDotsContainer, cache);
    }
    
    const healthChanged = cache.lastHealth !== health;
    const positionChanged = Math.abs(cache.lastLeft - playerLeft) > 0.1 || 
                           Math.abs(cache.lastTop - playerTop) > 0.1 ||
                           Math.abs(cache.lastSize - playerSize) > 0.1;
    
    if (!healthChanged && !positionChanged) {
        return;
    }
    
    const dots = healthDotsContainer.querySelectorAll('.health-dot');
    const dotOffset = 12;
    const dotSpacing = 5;
    const dotSize = 6;
    
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

export function forceUpdateHealthDots(player) {
    if (!player || !player.healthDots) return;
    
    const cache = healthDotsCache.get(player.healthDots);
    if (cache) {
        cache.lastHealth = -1;
    }
    
    const worldPixels = gridToWorldPixels(player.interpolatedX, player.interpolatedY, tileSize);
    const squareSize = Math.round(tileSize * PLAYER_SIZE);
    const offset = Math.round((tileSize - squareSize) / 2);
    updateHealthDots(player.healthDots, player.health, player.maxHealth, 
                     worldPixels.x + offset, worldPixels.y + offset, squareSize);
}

export function triggerHitFeedback(otherPlayerId, otherX, otherY, isBeingHit) {
    if (!damageOverlay) return;
    
    if (!isBeingHit) {
        damageOverlay.style.backgroundColor = 'rgba(255, 255, 200, 0.5)';
        setTimeout(() => {
            if (damageOverlay) {
                damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0)';
            }
        }, 150);
    }
}

