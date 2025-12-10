// ============================================================================
// STATE SYNCHRONIZATION
// ============================================================================

const { gameState } = require('./gameState.js');
const { getMapSeed } = require('./map.js');

// Get game state snapshot for client
function getGameStateSnapshot(excludePlayerId = null) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (id !== excludePlayerId) {
            players.push({
                id: player.id,
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                health: player.health,
                maxHealth: player.maxHealth,
                dashCooldownEndTime: player.dashCooldownEndTime,
                dashEndTime: player.dashEndTime,
                dashDirection: player.dashDirection,
                manaCooldownEndTime: player.manaCooldownEndTime,
                isDashing: player.isDashing,
                isCastingMana: player.isCastingMana,
                manaCastEndTime: player.manaCastEndTime,
                color: player.color
            });
        }
    }
    
    return {
        players: players,
        mapSeed: getMapSeed()
    };
}

// Get game state snapshot with delta compression (only changed data)
function getGameStateSnapshotDelta(excludePlayerId = null, lastSentState = new Map()) {
    const players = [];
    const now = Date.now() / 1000;
    
    for (const [id, player] of gameState.players.entries()) {
        if (id === excludePlayerId) continue;
        
        const lastState = lastSentState.get(id);
        const playerData = {
            id: player.id,
            x: player.x,
            y: player.y,
            targetX: player.targetX,
            targetY: player.targetY,
            health: player.health,
            isDashing: player.isDashing,
            isCastingMana: player.isCastingMana
        };
        
        // Update isDashing based on dashEndTime
        const isDashing = player.dashEndTime && player.dashEndTime > now;
        if (player.isDashing !== isDashing) {
            player.isDashing = isDashing;
        }
        
        // Check if cooldowns expired (was active, now inactive)
        const lastDashCooldown = lastState ? lastState.dashCooldownEndTime : null;
        const currentDashCooldown = player.dashCooldownEndTime;
        const dashCooldownWasActive = lastDashCooldown && lastDashCooldown > 0;
        const dashCooldownIsActive = currentDashCooldown > now;
        const dashCooldownExpired = dashCooldownWasActive && !dashCooldownIsActive;
        
        const lastDashEnd = lastState ? lastState.dashEndTime : null;
        const dashEndWasActive = lastDashEnd && lastDashEnd > 0;
        const dashEndIsActive = player.dashEndTime && player.dashEndTime > now;
        const dashEndExpired = dashEndWasActive && !dashEndIsActive;
        
        const lastManaCooldown = lastState ? lastState.manaCooldownEndTime : null;
        const currentManaCooldown = player.manaCooldownEndTime;
        const manaCooldownWasActive = lastManaCooldown && lastManaCooldown > 0;
        const manaCooldownIsActive = currentManaCooldown > now;
        const manaCooldownExpired = manaCooldownWasActive && !manaCooldownIsActive;
        
        // Only include if state changed or if we don't have last state
        let hasChanged = !lastState;
        if (lastState) {
            hasChanged = (
                lastState.x !== playerData.x ||
                lastState.y !== playerData.y ||
                lastState.targetX !== playerData.targetX ||
                lastState.targetY !== playerData.targetY ||
                lastState.health !== playerData.health ||
                lastState.isDashing !== playerData.isDashing ||
                lastState.isCastingMana !== playerData.isCastingMana ||
                dashCooldownExpired ||
                dashEndExpired ||
                manaCooldownExpired
            );
        }
        
        if (hasChanged) {
            // Include cooldown times if they're active OR if they just expired (send 0 to clear client state)
            if (player.dashCooldownEndTime > now) {
                playerData.dashCooldownEndTime = player.dashCooldownEndTime;
            } else if (dashCooldownExpired) {
                playerData.dashCooldownEndTime = 0;
            }
            if (player.dashEndTime > now) {
                playerData.dashEndTime = player.dashEndTime;
                playerData.dashDirection = player.dashDirection;
            } else if (player.dashEndTime > 0 && player.dashEndTime <= now) {
                // Dash just expired, send 0 to clear
                playerData.dashEndTime = 0;
                playerData.dashDirection = null;
            }
            if (player.manaCooldownEndTime > now) {
                playerData.manaCooldownEndTime = player.manaCooldownEndTime;
            } else if (manaCooldownExpired) {
                playerData.manaCooldownEndTime = 0;
            }
            if (player.isCastingMana && player.manaCastEndTime > now) {
                playerData.manaCastEndTime = player.manaCastEndTime;
            }
            
            players.push(playerData);
        }
    }
    
    return { players: players };
}

module.exports = {
    getGameStateSnapshot,
    getGameStateSnapshotDelta
};

