// ============================================================================
// OTHER PLAYER MANAGEMENT
// ============================================================================

import { serverTimeToClient, getCurrentTime, getMovementDirection } from './utils.js';

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
    
    // Convert server timestamps to client-relative time
    const manaCastEndTime = serverTimeToClient(playerData.manaCastEndTime);
    const dashEndTime = serverTimeToClient(playerData.dashEndTime);
    
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
        
        // Update cooldowns only if provided
        if (playerData.dashCooldownEndTime !== undefined) {
            player.dashCooldownEndTime = playerData.dashCooldownEndTime === 0 ? 0 : serverTimeToClient(playerData.dashCooldownEndTime);
        } else {
            const now = getCurrentTime();
            if (player.dashCooldownEndTime > 0 && player.dashCooldownEndTime <= now) {
                player.dashCooldownEndTime = 0;
            }
        }
        if (playerData.dashEndTime !== undefined) {
            if (playerData.dashEndTime === 0) {
                player.dashEndTime = 0;
                player.dashDirection = null;
                player.isDashing = false;
            } else {
                player.dashEndTime = serverTimeToClient(playerData.dashEndTime);
                player.dashDirection = playerData.dashDirection || null;
                player.isDashing = true;
            }
        } else {
            const now = getCurrentTime();
            if (player.dashEndTime > 0 && player.dashEndTime <= now) {
                player.dashEndTime = 0;
                player.dashDirection = null;
                player.isDashing = false;
            }
        }
        
        if (playerData.manaCooldownEndTime !== undefined) {
            player.manaCooldownEndTime = serverTimeToClient(playerData.manaCooldownEndTime);
        }
        
        // Update color if it changed
        if (playerData.color && playerData.color !== player.color) {
            player.color = playerData.color;
            if (player.element) {
                player.element.style.backgroundColor = playerData.color;
            }
        }
        
        // Convert server timestamp to client-relative time
        if (playerData.manaCastEndTime !== undefined) {
            player.manaCastEndTime = serverTimeToClient(playerData.manaCastEndTime);
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
            player.lastMovementDirection = getMovementDirection(diffX, diffY);
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

