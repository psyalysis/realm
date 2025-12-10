// ============================================================================
// OTHER PLAYER MANAGEMENT
// ============================================================================

let world; // DOM element (will be initialized)
export const otherPlayers = new Map(); // playerId -> player data

export function initPlayerManager(worldElement) {
    world = worldElement;
}

export function addOtherPlayer(playerData) {
    const playerElement = document.createElement('div');
    playerElement.className = 'other-player';
    playerElement.id = `player-${playerData.id}`;
    playerElement.style.backgroundColor = playerData.color;
    world.appendChild(playerElement);
    
    // Create health dots for other player
    const healthDotsContainer = document.createElement('div');
    healthDotsContainer.className = 'health-dots';
    healthDotsContainer.id = `health-dots-${playerData.id}`;
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'health-dot';
        healthDotsContainer.appendChild(dot);
    }
    world.appendChild(healthDotsContainer);
    
    // Create mana cast bar for other player
    const manaCastBarContainer = document.createElement('div');
    manaCastBarContainer.className = 'mana-cast-bar';
    manaCastBarContainer.id = `mana-cast-bar-${playerData.id}`;
    const manaCastBarFill = document.createElement('div');
    manaCastBarFill.className = 'mana-cast-fill';
    manaCastBarContainer.appendChild(manaCastBarFill);
    world.appendChild(manaCastBarContainer);
    
    // Convert server timestamp to client-relative time for mana cast
    const now = performance.now() / 1000;
    const serverNow = Date.now() / 1000;
    let manaCastEndTime = 0;
    if (playerData.manaCastEndTime > 0) {
        const timeUntilCastComplete = playerData.manaCastEndTime - serverNow;
        manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
    }
    
    // Convert server timestamp to client-relative time for dash
    let dashEndTime = 0;
    if (playerData.dashEndTime > 0) {
        const timeUntilDashEnd = playerData.dashEndTime - serverNow;
        dashEndTime = now + Math.max(0, timeUntilDashEnd);
    }
    
    otherPlayers.set(playerData.id, {
        id: playerData.id,
        x: playerData.x,
        y: playerData.y,
        targetX: playerData.targetX,
        targetY: playerData.targetY,
        interpolatedX: playerData.x,
        interpolatedY: playerData.y,
        health: playerData.health,
        maxHealth: playerData.maxHealth,
        dashCooldownEndTime: playerData.dashCooldownEndTime,
        dashEndTime: dashEndTime,
        dashDirection: playerData.dashDirection || null,
        manaCooldownEndTime: playerData.manaCooldownEndTime,
        isDashing: playerData.isDashing,
        isCastingMana: playerData.isCastingMana,
        manaCastEndTime: manaCastEndTime,
        color: playerData.color,
        element: playerElement,
        healthDots: healthDotsContainer,
        manaCastBar: manaCastBarContainer,
        manaCastFill: manaCastBarFill,
        lastMovementDirection: null,
        wobbleStartTime: null
    });
}

export function removeOtherPlayer(playerId) {
    const player = otherPlayers.get(playerId);
    if (player) {
        if (player.element) player.element.remove();
        if (player.healthDots) player.healthDots.remove();
        if (player.manaCastBar) player.manaCastBar.remove();
    }
    otherPlayers.delete(playerId);
}

export function updateOtherPlayer(playerData) {
    const player = otherPlayers.get(playerData.id);
    if (player) {
        // Only update fields that are present (delta compression support)
        if (playerData.x !== undefined) player.x = playerData.x;
        if (playerData.y !== undefined) player.y = playerData.y;
        if (playerData.targetX !== undefined) player.targetX = playerData.targetX;
        if (playerData.targetY !== undefined) player.targetY = playerData.targetY;
        if (playerData.health !== undefined) player.health = playerData.health;
        if (playerData.maxHealth !== undefined) player.maxHealth = playerData.maxHealth;
        if (playerData.isDashing !== undefined) player.isDashing = playerData.isDashing;
        if (playerData.isCastingMana !== undefined) player.isCastingMana = playerData.isCastingMana;
        if (playerData.isDead !== undefined) player.isDead = playerData.isDead;
        if (playerData.isDead !== undefined) player.isDead = playerData.isDead;
        
        // Update cooldowns only if provided
        if (playerData.dashCooldownEndTime !== undefined) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            if (playerData.dashCooldownEndTime === 0) {
                player.dashCooldownEndTime = 0;
            } else {
                const timeUntilDash = playerData.dashCooldownEndTime - serverNow;
                player.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
            }
        } else {
            const now = performance.now() / 1000;
            if (player.dashCooldownEndTime > 0 && player.dashCooldownEndTime <= now) {
                player.dashCooldownEndTime = 0;
            }
        }
        if (playerData.dashEndTime !== undefined) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            if (playerData.dashEndTime === 0) {
                player.dashEndTime = 0;
                player.dashDirection = null;
                player.isDashing = false;
            } else {
                const timeUntilDashEnd = playerData.dashEndTime - serverNow;
                player.dashEndTime = now + Math.max(0, timeUntilDashEnd);
                player.dashDirection = playerData.dashDirection || null;
                player.isDashing = true;
            }
        } else {
            const now = performance.now() / 1000;
            if (player.dashEndTime > 0 && player.dashEndTime <= now) {
                player.dashEndTime = 0;
                player.dashDirection = null;
                player.isDashing = false;
            }
        }
        
        if (playerData.manaCooldownEndTime !== undefined) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            const timeUntilMana = playerData.manaCooldownEndTime - serverNow;
            player.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        }
        
        // Update color if it changed
        if (playerData.color && playerData.color !== player.color) {
            player.color = playerData.color;
            if (player.element) {
                player.element.style.backgroundColor = playerData.color;
            }
        }
        
        // Convert server timestamp to client-relative time
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        if (playerData.manaCastEndTime !== undefined) {
            if (playerData.manaCastEndTime > 0) {
                const timeUntilCastComplete = playerData.manaCastEndTime - serverNow;
                player.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
            } else {
                player.manaCastEndTime = 0;
            }
        }
    } else {
        addOtherPlayer(playerData);
    }
}

export function updateOtherPlayerPosition(playerId, x, y, targetX, targetY) {
    const player = otherPlayers.get(playerId);
    if (player) {
        const prevInterpolatedX = player.interpolatedX;
        const prevInterpolatedY = player.interpolatedY;
        
        player.x = x;
        player.y = y;
        player.targetX = targetX;
        player.targetY = targetY;
        
        const diffX = targetX - prevInterpolatedX;
        const diffY = targetY - prevInterpolatedY;
        
        if (Math.abs(diffX) > 0.01 || Math.abs(diffY) > 0.01) {
            if (Math.abs(diffX) > Math.abs(diffY)) {
                player.lastMovementDirection = diffX > 0 ? 'RIGHT' : 'LEFT';
            } else {
                player.lastMovementDirection = diffY > 0 ? 'DOWN' : 'UP';
            }
        }
        
        player.wobbleStartTime = null;
    }
}

// Flash effect on player when they're hit
export function triggerOtherPlayerDamageEffect(playerId) {
    const player = otherPlayers.get(playerId);
    if (!player || !player.element) return;
    
    player.element.classList.add('damage-flash');
    
    setTimeout(() => {
        if (player && player.element) {
            player.element.classList.remove('damage-flash');
        }
    }, 200);
}

