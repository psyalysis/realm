// ============================================================================
// SERVER ABILITIES (Dash, Mana)
// ============================================================================

const { gameState } = require('./gameState.js');
const { DASH_DURATION, DASH_COOLDOWN, MANA_COOLDOWN, MANA_CAST_TIME, MAX_HEALTH, HIT_COOLDOWN } = require('./config.js');
const { isWall, findNearestValidPosition } = require('./map.js');

// Process dash - activates speed boost instead of teleporting
function processDash(playerId, direction) {
    const player = gameState.players.get(playerId);
    if (!player) return { success: false };
    
    if (player.isDead) return { success: false };
    
    const currentTime = Date.now() / 1000;
    
    // Check cooldown
    if (player.dashCooldownEndTime > currentTime) {
        return { success: false };
    }
    
    // Check if already dashing
    if (player.dashEndTime && player.dashEndTime > currentTime) {
        return { success: false };
    }
    
    // Validate direction
    if (!direction || !['MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT'].includes(direction)) {
        return { success: false };
    }
    
    // Validate current position
    if (isWall(player.x, player.y)) {
        console.warn(`Player ${playerId} is in a wall at (${player.x}, ${player.y}) during dash, correcting...`);
        const validPos = findNearestValidPosition(player.x, player.y);
        player.x = validPos.x;
        player.y = validPos.y;
        player.targetX = validPos.x;
        player.targetY = validPos.y;
        player.lastUpdate = Date.now();
        return { success: false, positionCorrected: true };
    }
    
    // Activate dash speed boost with locked direction
    player.isDashing = true;
    player.dashEndTime = currentTime + DASH_DURATION;
    player.dashCooldownEndTime = currentTime + DASH_COOLDOWN;
    player.dashDirection = direction;
    player.lastUpdate = Date.now();
    
    return { success: true };
}

// Process mana ability
function processMana(playerId, io) {
    const player = gameState.players.get(playerId);
    if (!player) return false;
    
    if (player.isDead) return false;
    
    const currentTime = Date.now() / 1000;
    
    if (player.manaCooldownEndTime > currentTime) return false;
    if (player.isCastingMana) return false;
    if (player.health >= MAX_HEALTH) return false;
    
    player.isCastingMana = true;
    player.manaCastEndTime = currentTime + MANA_CAST_TIME;
    player.manaCooldownEndTime = currentTime + MANA_COOLDOWN;
    player.lastUpdate = Date.now();
    
    // Complete mana cast after delay
    setTimeout(() => {
        const p = gameState.players.get(playerId);
        if (p && p.isCastingMana) {
            p.health = Math.min(MAX_HEALTH, p.health + 1);
            p.isCastingMana = false;
            
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) {
                playerSocket.emit('manaCastComplete', {
                    health: p.health,
                    isCastingMana: false
                });
                io.emit('playerHealthChanged', {
                    id: playerId,
                    health: p.health
                });
            }
        }
    }, MANA_CAST_TIME * 1000);
    
    return true;
}

module.exports = {
    processDash,
    processMana
};

