// ============================================================================
// SERVER PLAYER MANAGEMENT
// ============================================================================

const { gameState } = require('./gameState.js');
const { MAX_HEALTH, WORLD_WIDTH, WORLD_HEIGHT } = require('./config.js');
const { isWall, findNearestValidPosition } = require('./map.js');

// Player colors for visual distinction
const PLAYER_COLORS = [
    '#ff0000', // Red
    '#0000ff', // Blue
    '#00ff00', // Green
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
    '#ff8800', // Orange
    '#8800ff'  // Purple
];

let nextColorIndex = 0;
const occupiedSpawnPositions = new Set(); // Track occupied spawn positions

// Find a random valid spawn position around the center
function findSpawnPosition() {
    const centerX = Math.floor(WORLD_WIDTH / 2);
    const centerY = Math.floor(WORLD_HEIGHT / 2);
    const spawnRadius = 5; // Maximum distance from center to spawn
    const maxAttempts = 100; // Maximum attempts to find a valid position
    
    // Try to find a valid spawn position
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Generate random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spawnRadius;
        
        // Calculate spawn position
        const spawnX = Math.floor(centerX + Math.cos(angle) * distance);
        const spawnY = Math.floor(centerY + Math.sin(angle) * distance);
        
        // Check if position is valid
        if (spawnX >= 0 && spawnX < WORLD_WIDTH && 
            spawnY >= 0 && spawnY < WORLD_HEIGHT &&
            !isWall(spawnX, spawnY)) {
            
            // Check if position is already occupied
            const positionKey = `${spawnX},${spawnY}`;
            if (!occupiedSpawnPositions.has(positionKey)) {
                // Mark position as occupied
                occupiedSpawnPositions.add(positionKey);
                return { x: spawnX, y: spawnY };
            }
        }
    }
    
    // Fallback: try positions in a spiral pattern around center
    // First check center itself
    if (!isWall(centerX, centerY)) {
        const centerKey = `${centerX},${centerY}`;
        if (!occupiedSpawnPositions.has(centerKey)) {
            occupiedSpawnPositions.add(centerKey);
            return { x: centerX, y: centerY };
        }
    }
    
    // Then check in expanding radius
    for (let radius = 1; radius <= spawnRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check positions on the edge of current radius
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const spawnX = centerX + dx;
                const spawnY = centerY + dy;
                
                if (spawnX >= 0 && spawnX < WORLD_WIDTH && 
                    spawnY >= 0 && spawnY < WORLD_HEIGHT &&
                    !isWall(spawnX, spawnY)) {
                    
                    const positionKey = `${spawnX},${spawnY}`;
                    if (!occupiedSpawnPositions.has(positionKey)) {
                        occupiedSpawnPositions.add(positionKey);
                        return { x: spawnX, y: spawnY };
                    }
                }
            }
        }
    }
    
    // Last resort: use center if nothing else works (but validate it's not a wall)
    const centerKey = `${centerX},${centerY}`;
    if (!isWall(centerX, centerY) && !occupiedSpawnPositions.has(centerKey)) {
        occupiedSpawnPositions.add(centerKey);
        return { x: centerX, y: centerY };
    }
    
    // If even center is occupied or is a wall, find any free spot
    console.warn('Warning: All spawn positions occupied or center is wall, searching for free spot');
    // Search entire map for a free spot
    for (let radius = 0; radius <= WORLD_WIDTH; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check positions on the edge of current radius
                if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const testX = centerX + dx;
                const testY = centerY + dy;
                
                if (testX >= 0 && testX < WORLD_WIDTH && 
                    testY >= 0 && testY < WORLD_HEIGHT &&
                    !isWall(testX, testY)) {
                    
                    const positionKey = `${testX},${testY}`;
                    if (!occupiedSpawnPositions.has(positionKey)) {
                        occupiedSpawnPositions.add(positionKey);
                        console.log(`Found free spawn position at (${testX}, ${testY})`);
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    
    // Absolute last resort: use findNearestValidPosition
    console.error('ERROR: Could not find any valid spawn position! Using findNearestValidPosition');
    const validPos = findNearestValidPosition(centerX, centerY);
    const positionKey = `${validPos.x},${validPos.y}`;
    occupiedSpawnPositions.add(positionKey);
    return validPos;
}

// Create new player
function createPlayer(playerId) {
    const spawnPos = findSpawnPosition();
    
    // Double-check that spawn position is valid (not a wall)
    if (isWall(spawnPos.x, spawnPos.y)) {
        console.error(`ERROR: Player ${playerId} attempted to spawn on wall at (${spawnPos.x}, ${spawnPos.y})!`);
        console.error('Correcting spawn position...');
        const validPos = findNearestValidPosition(spawnPos.x, spawnPos.y);
        spawnPos.x = validPos.x;
        spawnPos.y = validPos.y;
        console.log(`Corrected spawn position to (${spawnPos.x}, ${spawnPos.y})`);
    }
    
    const player = {
        id: playerId,
        x: spawnPos.x,
        y: spawnPos.y,
        targetX: spawnPos.x,
        targetY: spawnPos.y,
        spawnX: spawnPos.x, // Original spawn position
        spawnY: spawnPos.y, // Original spawn position
        health: MAX_HEALTH,
        maxHealth: MAX_HEALTH,
        dashCooldownEndTime: 0,
        dashEndTime: 0, // When dash speed boost ends
        dashDirection: null, // Locked direction during dash (MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT)
        manaCooldownEndTime: 0,
        isDashing: false,
        isCastingMana: false,
        manaCastEndTime: 0,
        lastHitTime: 0, // Track when player last dealt damage (for hit cooldown)
        isDead: false,
        respawnTime: 0, // Timestamp when player will respawn
        color: PLAYER_COLORS[nextColorIndex % PLAYER_COLORS.length],
        lastUpdate: Date.now()
    };
    
    nextColorIndex++;
    gameState.players.set(playerId, player);
    
    // Final validation log
    if (isWall(player.x, player.y)) {
        console.error(`CRITICAL ERROR: Player ${playerId} created on wall at (${player.x}, ${player.y})!`);
    } else {
        console.log(`Player ${playerId} spawned at (${player.x}, ${player.y}) - validated: not a wall`);
    }
    
    return player;
}

// Remove player
function removePlayer(playerId) {
    const player = gameState.players.get(playerId);
    if (player) {
        // Free up spawn position
        const positionKey = `${player.x},${player.y}`;
        occupiedSpawnPositions.delete(positionKey);
        console.log(`Removed player ${playerId} from position (${player.x}, ${player.y})`);
    }
    const wasRemoved = gameState.players.delete(playerId);
    if (wasRemoved) {
        console.log(`Player ${playerId} removed. Remaining players: ${gameState.players.size}`);
    }
    return wasRemoved;
}

// Find player at a specific position
function getPlayerAtPosition(x, y, excludePlayerId = null) {
    for (const [id, p] of gameState.players.entries()) {
        if (id === excludePlayerId) continue;
        if (p.x === x && p.y === y) {
            return p;
        }
    }
    return null;
}

// Deal damage to a player
function dealDamageToPlayer(targetPlayer, attackerId, damageAmount = 1) {
    // Deal damage
    targetPlayer.health = Math.max(0, targetPlayer.health - damageAmount);
    targetPlayer.lastUpdate = Date.now();
    
    // Check if player died
    if (targetPlayer.health <= 0 && !targetPlayer.isDead) {
        targetPlayer.isDead = true;
        const { RESPAWN_DELAY } = require('./config.js');
        targetPlayer.respawnTime = Date.now() / 1000 + RESPAWN_DELAY;
    }
    
    return true; // Damage was dealt
}

// Respawn a dead player
function respawnPlayer(playerId, io) {
    const player = gameState.players.get(playerId);
    if (!player || !player.isDead) return false;
    
    // Respawn at center of map
    let respawnX = Math.floor(WORLD_WIDTH / 2);
    let respawnY = Math.floor(WORLD_HEIGHT / 2);
    
    // Double-check that center position is valid
    if (isWall(respawnX, respawnY)) {
        const validPos = findNearestValidPosition(respawnX, respawnY);
        respawnX = validPos.x;
        respawnY = validPos.y;
    }
    
    player.x = respawnX;
    player.y = respawnY;
    player.targetX = respawnX;
    player.targetY = respawnY;
    player.health = MAX_HEALTH;
    player.isDead = false;
    player.respawnTime = 0;
    player.lastUpdate = Date.now();
    
    // Emit respawn event
    if (io) {
        io.emit('playerRespawned', {
            id: playerId,
            x: player.x,
            y: player.y,
            targetX: player.targetX,
            targetY: player.targetY,
            health: player.health
        });
    }
    
    return true;
}

// Check and handle respawns for all players
function checkRespawns(io) {
    const currentTime = Date.now() / 1000;
    for (const [playerId, player] of gameState.players.entries()) {
        if (player.isDead && player.respawnTime > 0 && currentTime >= player.respawnTime) {
            respawnPlayer(playerId, io);
        }
    }
}

// Clear spawn positions (when game initializes)
function clearSpawnPositions() {
    occupiedSpawnPositions.clear();
}

module.exports = {
    createPlayer,
    removePlayer,
    getPlayerAtPosition,
    dealDamageToPlayer,
    respawnPlayer,
    checkRespawns,
    clearSpawnPositions
};

