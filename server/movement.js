// ============================================================================
// MOVEMENT PROCESSING
// ============================================================================

const { gameState } = require('./gameState.js');
const { WORLD_WIDTH, WORLD_HEIGHT, HIT_COOLDOWN } = require('./config.js');
const { isWall, findNearestValidPosition } = require('./map.js');
const { getPlayerAtPosition, dealDamageToPlayer } = require('./player.js');

// Process movement action
function processMovement(playerId, action) {
    const player = gameState.players.get(playerId);
    if (!player) return { success: false };
    
    if (player.isDead) return { success: false };
    if (player.isCastingMana) return { success: false };
    
    // Check if dashing and block movement in other directions
    const currentTime = Date.now() / 1000;
    const isDashing = player.dashEndTime && player.dashEndTime > currentTime;
    if (isDashing && player.dashDirection && action !== player.dashDirection) {
        // Block movement in directions other than dash direction
        return { success: false, blocked: true };
    }
    
    // Validate current position is not in a wall (safety check)
    if (isWall(player.x, player.y)) {
        console.warn(`Player ${playerId} is in a wall at (${player.x}, ${player.y}), correcting...`);
        const validPos = findNearestValidPosition(player.x, player.y);
        player.x = validPos.x;
        player.y = validPos.y;
        player.targetX = validPos.x;
        player.targetY = validPos.y;
        player.lastUpdate = Date.now();
        return { success: false, positionCorrected: true };
    }
    
    let newX = player.x;
    let newY = player.y;
    
    switch(action) {
        case 'MOVE_UP':
            newY = player.y - 1;
            break;
        case 'MOVE_DOWN':
            newY = player.y + 1;
            break;
        case 'MOVE_LEFT':
            newX = player.x - 1;
            break;
        case 'MOVE_RIGHT':
            newX = player.x + 1;
            break;
    }
    
    // Validate new position is within bounds and not a wall
    if (newX >= 0 && newX < WORLD_WIDTH && 
        newY >= 0 && newY < WORLD_HEIGHT && 
        !isWall(newX, newY)) {
        
        // Check if there's another player already at the target position
        const victimPlayer = getPlayerAtPosition(newX, newY, playerId);
        if (victimPlayer) {
            const currentTime = Date.now() / 1000;
            const timeSinceLastHit = currentTime - player.lastHitTime;
            const canHit = timeSinceLastHit >= HIT_COOLDOWN;
            
            if (canHit) {
                dealDamageToPlayer(victimPlayer, playerId, 1);
                player.lastHitTime = currentTime;
                return { 
                    success: false, 
                    collision: true, 
                    targetPlayerId: victimPlayer.id,
                    targetPlayerHealth: victimPlayer.health,
                    damageDealt: true
                };
            } else {
                return { 
                    success: false, 
                    collision: true, 
                    targetPlayerId: victimPlayer.id,
                    targetPlayerHealth: victimPlayer.health,
                    damageDealt: false,
                    hitOnCooldown: true
                };
            }
        }
        
        // No collision, move normally
        player.x = newX;
        player.y = newY;
        player.targetX = newX;
        player.targetY = newY;
        player.lastUpdate = Date.now();
        
        // Final validation: ensure we didn't move into a wall
        if (isWall(player.x, player.y)) {
            console.error(`CRITICAL: Player ${playerId} moved into wall at (${player.x}, ${player.y}), correcting...`);
            const validPos = findNearestValidPosition(player.x, player.y);
            player.x = validPos.x;
            player.y = validPos.y;
            player.targetX = validPos.x;
            player.targetY = validPos.y;
            return { success: false, positionCorrected: true };
        }
        
        return { success: true };
    }
    
    return { success: false };
}

module.exports = {
    processMovement
};

