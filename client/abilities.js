// ============================================================================
// ABILITIES SYSTEM (Dash, Mana, Health)
// ============================================================================

import { gameState, performanceCache, setPreviousHealth, getPreviousHealth } from './gameState.js';
import { DASH_COOLDOWN, DASH_DURATION, MANA_COOLDOWN, MANA_CAST_TIME, MAX_HEALTH, INPUT_MAP, WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { isWall } from './map.js';

// DOM elements (will be initialized)
let dashCooldownFill, healthFill, manaFill, viewport, damageOverlay, gameNotRunningMessage;
let socket, isConnected, myPlayerId;
let damageEffectTimeout = null;

export function initAbilities(elements, networkState) {
    dashCooldownFill = elements.dashCooldownFill;
    healthFill = elements.healthFill;
    manaFill = elements.manaFill;
    viewport = elements.viewport;
    damageOverlay = elements.damageOverlay;
    gameNotRunningMessage = elements.gameNotRunningMessage;
    
    socket = networkState.socket;
    isConnected = networkState.isConnected;
    myPlayerId = networkState.myPlayerId;
}

export function updateNetworkState(networkState) {
    socket = networkState.socket;
    isConnected = networkState.isConnected;
    myPlayerId = networkState.myPlayerId;
}

export function updateDashCooldownBar() {
    const currentTime = performance.now() / 1000;
    
    // Safety check: if cooldown should have expired, clear it
    if (gameState.dashCooldownEndTime > 0 && gameState.dashCooldownEndTime <= currentTime) {
        gameState.dashCooldownEndTime = 0;
    }
    
    let fillPercentage;
    if (gameState.dashCooldownEndTime > currentTime) {
        const cooldownRemaining = gameState.dashCooldownEndTime - currentTime;
        const cooldownProgress = 1.0 - (cooldownRemaining / DASH_COOLDOWN);
        fillPercentage = Math.max(0, Math.min(100, cooldownProgress * 100));
    } else {
        fillPercentage = 100;
    }
    
    // Only update DOM if value changed (performance optimization)
    if (Math.abs(fillPercentage - performanceCache.lastDashCooldownFill) > 0.1) {
        dashCooldownFill.style.height = fillPercentage + '%';
        performanceCache.lastDashCooldownFill = fillPercentage;
    }
}

export function updateGameRunningStatus() {
    if (!gameNotRunningMessage) return;
    
    const gameRunning = isConnected && socket && socket.connected && myPlayerId !== null;
    
    if (gameRunning) {
        gameNotRunningMessage.style.display = 'none';
    } else {
        gameNotRunningMessage.style.display = 'block';
    }
    
    const dashCooldownBar = document.getElementById('dashCooldownBar');
    const healthBar = document.getElementById('healthBar');
    const manaBar = document.getElementById('manaBar');
    
    if (dashCooldownBar) dashCooldownBar.style.display = gameRunning ? 'block' : 'none';
    if (healthBar) healthBar.style.display = gameRunning ? 'block' : 'none';
    if (manaBar) manaBar.style.display = gameRunning ? 'block' : 'none';
}

export function updateHealthBar(previousHealth) {
    const healthPercentage = (gameState.health / gameState.maxHealth) * 100;
    const clampedPercentage = Math.max(0, Math.min(100, healthPercentage));
    
    if (Math.abs(clampedPercentage - performanceCache.lastHealthFill) > 0.1) {
        healthFill.style.height = clampedPercentage + '%';
        performanceCache.lastHealthFill = clampedPercentage;
    }
    
    // Check if player took damage (only trigger if health actually decreased)
    const prevHealth = previousHealth !== undefined ? previousHealth : getPreviousHealth();
    if (gameState.health < prevHealth && prevHealth > 0) {
        triggerDamageEffect();
    }
}

// Trigger damage visual effect (shake + red tint)
export function triggerDamageEffect() {
    if (!viewport || !damageOverlay) return;
    
    // Clear any existing timeout to prevent overlapping effects
    if (damageEffectTimeout !== null) {
        clearTimeout(damageEffectTimeout);
        damageEffectTimeout = null;
    }
    
    viewport.classList.add('damage-shake');
    damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.4)';
    
    damageEffectTimeout = setTimeout(() => {
        if (!viewport || !damageOverlay) {
            damageEffectTimeout = null;
            return;
        }
        
        viewport.classList.remove('damage-shake');
        
        // Disable CSS transition and force immediate clear
        damageOverlay.style.transition = 'none';
        damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0)';
        
        // Force a reflow to ensure the style change is applied immediately
        void damageOverlay.offsetHeight;
        
        // Double-check it's cleared after a frame
        requestAnimationFrame(() => {
            if (damageOverlay) {
                damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0)';
                // Restore transition after a delay to allow for future transitions
                setTimeout(() => {
                    if (damageOverlay) {
                        damageOverlay.style.transition = '';
                    }
                }, 100);
            }
        });
        
        damageEffectTimeout = null;
    }, 250);
}

export function updateManaBar() {
    const currentTime = performance.now() / 1000;
    
    let fillPercentage;
    if (gameState.manaCooldownEndTime > currentTime) {
        const cooldownRemaining = gameState.manaCooldownEndTime - currentTime;
        const cooldownProgress = 1.0 - (cooldownRemaining / MANA_COOLDOWN);
        fillPercentage = Math.max(0, Math.min(100, cooldownProgress * 100));
    } else {
        fillPercentage = 100;
    }
    
    if (Math.abs(fillPercentage - performanceCache.lastManaFill) > 0.1) {
        manaFill.style.height = fillPercentage + '%';
        performanceCache.lastManaFill = fillPercentage;
    }
}

export function handleMana() {
    if (isConnected && socket) {
        socket.emit('mana');
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
    const currentTime = performance.now() / 1000;
    
    if (gameState.manaCooldownEndTime > currentTime) return;
    if (gameState.isCastingMana) return;
    if (gameState.health >= gameState.maxHealth) return;
    
    gameState.isCastingMana = true;
    gameState.manaCastEndTime = currentTime + MANA_CAST_TIME;
    gameState.movementQueue = [];
    gameState.manaCooldownEndTime = currentTime + MANA_COOLDOWN;
}

// Check if mana cast is complete (called from animation loop)
export function checkManaCastComplete(previousHealthRef) {
    const currentTime = performance.now() / 1000;
    if (gameState.isCastingMana && gameState.manaCastEndTime <= currentTime) {
        gameState.health = Math.min(gameState.maxHealth, gameState.health + 1);
        gameState.isCastingMana = false;
        setPreviousHealth(gameState.health);
        return true; // Indicates health was updated
    }
    return false;
}

// Dash handling
let lastClientDashTime = 0;
const CLIENT_DASH_RATE_LIMIT = 300;

export function handleDash() {
    const currentTime = performance.now() / 1000;
    
    if (gameState.dashCooldownEndTime > currentTime) {
        return;
    }
    
    // Check if already dashing
    if (gameState.dashEndTime && gameState.dashEndTime > currentTime) {
        return;
    }
    
    // Determine dash direction from current movement or pressed keys
    let dashDirection = null;
    
    // Priority 1: Check currently pressed movement keys
    const priorityKeys = ['w', 's', 'a', 'd'];
    for (const key of priorityKeys) {
        if (gameState.pressedKeys.has(key)) {
            dashDirection = INPUT_MAP[key];
            break;
        }
    }
    
    // Priority 2: Use last movement direction if no keys pressed
    if (!dashDirection && gameState.lastMovementDirection) {
        switch(gameState.lastMovementDirection) {
            case 'UP': dashDirection = 'MOVE_UP'; break;
            case 'DOWN': dashDirection = 'MOVE_DOWN'; break;
            case 'LEFT': dashDirection = 'MOVE_LEFT'; break;
            case 'RIGHT': dashDirection = 'MOVE_RIGHT'; break;
        }
    }
    
    // If still no direction, can't dash
    if (!dashDirection) {
        return;
    }
    
    executeDash(dashDirection);
}

function executeDash(direction) {
    if (isConnected && socket) {
        const now = performance.now();
        if (now - lastClientDashTime < CLIENT_DASH_RATE_LIMIT) return;
        lastClientDashTime = now;
        
        if (isWall(gameState.player.x, gameState.player.y)) {
            console.warn('Player is in a wall, cannot dash');
            return;
        }
        
        socket.emit('dash', direction);
        
        // Optimistically activate dash speed boost
        const optimisticTime = performance.now() / 1000;
        gameState.dashEndTime = optimisticTime + DASH_DURATION;
        gameState.dashCooldownEndTime = optimisticTime + DASH_COOLDOWN;
        gameState.dashDirection = direction;
        gameState.isDashing = true;
        return;
    }
    
    // Single-player mode
    const currentTime = performance.now() / 1000;
    gameState.dashEndTime = currentTime + DASH_DURATION;
    gameState.dashCooldownEndTime = currentTime + DASH_COOLDOWN;
    gameState.dashDirection = direction;
    gameState.isDashing = true;
}

