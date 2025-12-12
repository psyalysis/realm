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
    const spawnRadius = 6; // Match the spawn clear radius from map generation
    const maxAttempts = 200; // Increased attempts
    
    // Helper to check if position is valid and available
    const isValidSpawn = (x, y) => {
        if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return false;
        if (isWall(x, y)) return false;
        const positionKey = `${x},${y}`;
        return !occupiedSpawnPositions.has(positionKey);
    };
    
    // Try random positions first (faster for most cases)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spawnRadius;
        const spawnX = Math.floor(centerX + Math.cos(angle) * distance);
        const spawnY = Math.floor(centerY + Math.sin(angle) * distance);
        
        if (isValidSpawn(spawnX, spawnY)) {
            const positionKey = `${spawnX},${spawnY}`;
            occupiedSpawnPositions.add(positionKey);
            return { x: spawnX, y: spawnY };
        }
    }
    
    // Fallback: systematic search in expanding radius from center
    // Check center first
    if (isValidSpawn(centerX, centerY)) {
        occupiedSpawnPositions.add(`${centerX},${centerY}`);
        return { x: centerX, y: centerY };
    }
    
    // Then check in expanding radius (check all positions, not just edges)
    for (let radius = 1; radius <= spawnRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Check all positions within radius (not just edges)
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > radius) continue;
                
                const spawnX = centerX + dx;
                const spawnY = centerY + dy;
                
                if (isValidSpawn(spawnX, spawnY)) {
                    const positionKey = `${spawnX},${spawnY}`;
                    occupiedSpawnPositions.add(positionKey);
                    return { x: spawnX, y: spawnY };
                }
            }
        }
    }
    
    // Last resort: search entire map systematically
    console.warn('Warning: Spawn area full, searching entire map for valid position');
    for (let radius = spawnRadius + 1; radius <= WORLD_WIDTH; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check edge positions to avoid redundant checks
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const testX = centerX + dx;
                const testY = centerY + dy;
                
                if (isValidSpawn(testX, testY)) {
                    const positionKey = `${testX},${testY}`;
                    occupiedSpawnPositions.add(positionKey);
                    console.log(`Found free spawn position at (${testX}, ${testY})`);
                    return { x: testX, y: testY };
                }
            }
        }
    }
    
    // Absolute last resort: use findNearestValidPosition (guaranteed to find something)
    console.error('ERROR: Could not find any valid spawn position! Using findNearestValidPosition');
    const validPos = findNearestValidPosition(centerX, centerY);
    const positionKey = `${validPos.x},${validPos.y}`;
    // Don't mark as occupied if it's a wall (shouldn't happen, but safety check)
    if (!isWall(validPos.x, validPos.y)) {
        occupiedSpawnPositions.add(positionKey);
    }
    return validPos;
}

// Create new player
function createPlayer(playerId) {
    let spawnPos = findSpawnPosition();
    const originalPos = { x: spawnPos.x, y: spawnPos.y };
    
    // Triple-check that spawn position is valid (not a wall)
    // This is a critical safety check - never spawn in a wall
    if (isWall(spawnPos.x, spawnPos.y)) {
        console.error(`ERROR: Player ${playerId} attempted to spawn on wall at (${spawnPos.x}, ${spawnPos.y})!`);
        console.error('Correcting spawn position using findNearestValidPosition...');
        const validPos = findNearestValidPosition(spawnPos.x, spawnPos.y);
        
        // Verify the corrected position is actually valid
        if (isWall(validPos.x, validPos.y)) {
            console.error(`CRITICAL: findNearestValidPosition returned wall at (${validPos.x}, ${validPos.y})!`);
            // Try center as absolute fallback
            const centerX = Math.floor(WORLD_WIDTH / 2);
            const centerY = Math.floor(WORLD_HEIGHT / 2);
            if (!isWall(centerX, centerY)) {
                spawnPos = { x: centerX, y: centerY };
                console.log(`Using center as fallback: (${centerX}, ${centerY})`);
            } else {
                // Last resort: search for ANY non-wall position
                spawnPos = null;
                for (let y = 0; y < WORLD_HEIGHT; y++) {
                    for (let x = 0; x < WORLD_WIDTH; x++) {
                        if (!isWall(x, y)) {
                            spawnPos = { x, y };
                            console.log(`Found emergency spawn at (${x}, ${y})`);
                            break;
                        }
                    }
                    if (spawnPos && !isWall(spawnPos.x, spawnPos.y)) break;
                }
            }
        } else {
            spawnPos = validPos;
        }
        
        // Update occupied positions if position changed
        if (spawnPos && (originalPos.x !== spawnPos.x || originalPos.y !== spawnPos.y)) {
            const oldKey = `${originalPos.x},${originalPos.y}`;
            occupiedSpawnPositions.delete(oldKey);
            if (!isWall(spawnPos.x, spawnPos.y)) {
                const newKey = `${spawnPos.x},${spawnPos.y}`;
                occupiedSpawnPositions.add(newKey);
            }
        }
        
        if (spawnPos) {
            console.log(`Corrected spawn position to (${spawnPos.x}, ${spawnPos.y})`);
        }
    }
    
    // Final validation before creating player
    if (!spawnPos || isWall(spawnPos.x, spawnPos.y)) {
        console.error(`CRITICAL ERROR: Player ${playerId} would spawn in wall at (${spawnPos ? `${spawnPos.x}, ${spawnPos.y}` : 'null'}) after all corrections!`);
        throw new Error(`Cannot create player ${playerId}: no valid spawn position found`);
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

// Find player at a specific position (excludes dead players)
function getPlayerAtPosition(x, y, excludePlayerId = null) {
    for (const [id, p] of gameState.players.entries()) {
        if (id === excludePlayerId) continue;
        if (p.isDead) continue; // Dead players don't block movement
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

