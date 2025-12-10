// ============================================================================
// MULTIPLAYER SERVER
// ============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(__dirname));

// Game Configuration (must match client)
const WORLD_WIDTH = 50;
const WORLD_HEIGHT = 50;
const BASE_ANIMATION_SPEED = 2.5;
const DASH_DISTANCE = 4;
const DASH_COOLDOWN = 2.0;
const MANA_COOLDOWN = 7.0;
const HIT_COOLDOWN = 0.4; // Cooldown between hits (seconds)
const MANA_CAST_TIME = 0.7;
const MAX_HEALTH = 3;

// Map generation (shared seed for consistency)
// Use a fixed seed so all players always see the same map
// If you want a new map, change this value
const FIXED_MAP_SEED = 12345; // Fixed seed for consistent map across all sessions
let mapSeed = FIXED_MAP_SEED;
let map = [];

// Game state - stores all players (shared across all connections)
const gameState = {
    players: new Map(), // playerId -> player data
    map: null
};

// Track if game has been initialized
let gameInitialized = false;

// Generate map with seed
function generateMap(seed) {
    // Simple seeded random function
    let seedValue = seed;
    function seededRandom() {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
    }
    
    const MAP_CENTER_X = WORLD_WIDTH / 2;
    const MAP_CENTER_Y = WORLD_HEIGHT / 2;
    const MAX_DISTANCE_FROM_CENTER = Math.sqrt(MAP_CENTER_X * MAP_CENTER_X + MAP_CENTER_Y * MAP_CENTER_Y);
    const WALL_CLUMP_BASE_PROBABILITY = 0.02;
    const WALL_CLUMP_MAX_PROBABILITY = 0.15;
    const WALL_CLUMP_SIZE_MIN = 3;
    const WALL_CLUMP_SIZE_MAX = 8;
    const WALL_CLUMP_SPREAD_CHANCE = 0.4;
    
    // Initialize map
    const newMap = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        newMap[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            newMap[y][x] = false;
        }
    }
    
    // Generate wall clumps
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            const dx = x - MAP_CENTER_X;
            const dy = y - MAP_CENTER_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDistance = Math.min(distance / MAX_DISTANCE_FROM_CENTER, 1.0);
            const probability = WALL_CLUMP_BASE_PROBABILITY + 
                               (WALL_CLUMP_MAX_PROBABILITY - WALL_CLUMP_BASE_PROBABILITY) * normalizedDistance;
            
            if (seededRandom() < probability && !newMap[y][x]) {
                generateWallClump(newMap, x, y, seededRandom, WALL_CLUMP_SIZE_MIN, WALL_CLUMP_SIZE_MAX, WALL_CLUMP_SPREAD_CHANCE);
            }
        }
    }
    
    // Ensure center area is clear for spawn (larger area for multiple players)
    const playerX = Math.floor(WORLD_WIDTH / 2);
    const playerY = Math.floor(WORLD_HEIGHT / 2);
    const spawnClearRadius = 6; // Clear a larger area around center for spawning
    
    for (let dy = -spawnClearRadius; dy <= spawnClearRadius; dy++) {
        for (let dx = -spawnClearRadius; dx <= spawnClearRadius; dx++) {
            const nx = playerX + dx;
            const ny = playerY + dy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Clear positions within spawn radius
            if (distance <= spawnClearRadius && 
                nx >= 0 && nx < WORLD_WIDTH && 
                ny >= 0 && ny < WORLD_HEIGHT) {
                newMap[ny][nx] = false;
            }
        }
    }
    
    return newMap;
}

function generateWallClump(map, startX, startY, randomFn, sizeMin, sizeMax, spreadChance) {
    const clumpSize = Math.floor(randomFn() * (sizeMax - sizeMin + 1)) + sizeMin;
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    
    let cellsPlaced = 0;
    
    while (queue.length > 0 && cellsPlaced < clumpSize) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;
        
        if (visited.has(key)) continue;
        if (current.x < 0 || current.x >= WORLD_WIDTH || current.y < 0 || current.y >= WORLD_HEIGHT) continue;
        
        visited.add(key);
        map[current.y][current.x] = true;
        cellsPlaced++;
        
        const directions = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 }
        ];
        
        for (const dir of directions) {
            const nx = current.x + dir.x;
            const ny = current.y + dir.y;
            const nextKey = `${nx},${ny}`;
            
            if (!visited.has(nextKey) && 
                nx >= 0 && nx < WORLD_WIDTH && 
                ny >= 0 && ny < WORLD_HEIGHT &&
                randomFn() < spreadChance) {
                queue.push({ x: nx, y: ny });
            }
        }
    }
}

function isWall(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
        return true;
    }
    return map[y][x] === true;
}

// Find nearest valid (non-wall) position
function findNearestValidPosition(startX, startY) {
    const maxRadius = 10; // Maximum search radius
    
    // Check starting position first
    if (!isWall(startX, startY)) {
        return { x: startX, y: startY };
    }
    
    // Search in expanding radius
    for (let radius = 1; radius <= maxRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check positions on the edge of current radius
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const testX = startX + dx;
                const testY = startY + dy;
                
                if (!isWall(testX, testY)) {
                    return { x: testX, y: testY };
                }
            }
        }
    }
    
    // Fallback to center if nothing found
    return { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
}

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

// Initialize game (only once, shared across all players)
function initGame() {
    if (gameInitialized) {
        console.log('Game already initialized, using existing map with seed:', mapSeed);
        return;
    }
    
    map = generateMap(mapSeed);
    gameState.map = map;
    occupiedSpawnPositions.clear(); // Clear spawn positions when game initializes
    gameInitialized = true;
    console.log('Game initialized with map seed:', mapSeed);
    console.log('All players will join this same game instance');
}

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
        health: MAX_HEALTH,
        maxHealth: MAX_HEALTH,
        dashCooldownEndTime: 0,
        manaCooldownEndTime: 0,
        isDashing: false,
        isCastingMana: false,
        manaCastEndTime: 0,
        lastHitTime: 0, // Track when player last dealt damage (for hit cooldown)
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
    
    return true; // Damage was dealt
}

// Process movement action
function processMovement(playerId, action) {
    const player = gameState.players.get(playerId);
    if (!player) return { success: false };
    
    if (player.isCastingMana) return { success: false }; // Can't move while casting
    
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
        // The player already at the location (victim) takes damage when someone moves into them
        const victimPlayer = getPlayerAtPosition(newX, newY, playerId);
        if (victimPlayer) {
            // Check hit cooldown - can only attack once every 0.4 seconds
            const currentTime = Date.now() / 1000;
            const timeSinceLastHit = currentTime - player.lastHitTime;
            const canHit = timeSinceLastHit >= HIT_COOLDOWN;
            
            if (canHit) {
                // Collision! The victim (player already at this location) takes damage
                // The attacker (player trying to move here) inflicts the damage
                dealDamageToPlayer(victimPlayer, playerId, 1);
                // Update hit cooldown
                player.lastHitTime = currentTime;
                // Return collision info for visual feedback
                return { 
                    success: false, 
                    collision: true, 
                    targetPlayerId: victimPlayer.id,
                    targetPlayerHealth: victimPlayer.health,
                    damageDealt: true
                };
            } else {
                // Hit is on cooldown - collision but no damage
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

// Process dash
function processDash(playerId, direction) {
    const player = gameState.players.get(playerId);
    if (!player) return { success: false };
    
    const currentTime = Date.now() / 1000;
    
    // Check cooldown
    if (player.dashCooldownEndTime > currentTime) {
        return { success: false };
    }
    
    // Validate current position is not in a wall (safety check)
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
    
    let deltaX = 0;
    let deltaY = 0;
    
    switch(direction) {
        case 'MOVE_UP':
            deltaY = -1;
            break;
        case 'MOVE_DOWN':
            deltaY = 1;
            break;
        case 'MOVE_LEFT':
            deltaX = -1;
            break;
        case 'MOVE_RIGHT':
            deltaX = 1;
            break;
    }
    
    // Find furthest valid position
    let finalX = player.x;
    let finalY = player.y;
    let hitPlayer = null;
    
    for (let i = 1; i <= DASH_DISTANCE; i++) {
        const testX = player.x + (deltaX * i);
        const testY = player.y + (deltaY * i);
        
        if (testX >= 0 && testX < WORLD_WIDTH && 
            testY >= 0 && testY < WORLD_HEIGHT && 
            !isWall(testX, testY)) {
            
            // Check for player collision
            // The player already at this location (victim) takes damage when dashed into
            const victimPlayer = getPlayerAtPosition(testX, testY, playerId);
            if (victimPlayer && !hitPlayer) {
                // Hit a player - stop dash here and deal damage to the victim
                hitPlayer = victimPlayer;
                break;
            }
            
            finalX = testX;
            finalY = testY;
        } else {
            break;
        }
    }
    
    // Final validation: ensure final position is not in a wall
    if (isWall(finalX, finalY)) {
        console.error(`CRITICAL: Dash would place player ${playerId} in wall at (${finalX}, ${finalY}), correcting...`);
        const validPos = findNearestValidPosition(finalX, finalY);
        finalX = validPos.x;
        finalY = validPos.y;
    }
    
    // If we hit a player, deal damage to the victim (player already at collision point)
    let damageDealt = false;
    if (hitPlayer) {
        // Check hit cooldown - can only attack once every 0.4 seconds
        const timeSinceLastHit = currentTime - player.lastHitTime;
        const canHit = timeSinceLastHit >= HIT_COOLDOWN;
        
        if (canHit) {
            // The victim (player already at the location) takes damage
            // The attacker (player dashing) inflicts the damage
            dealDamageToPlayer(hitPlayer, playerId, 1);
            // Update hit cooldown
            player.lastHitTime = currentTime;
            damageDealt = true;
        }
        
        // Move to position before collision (dash stops at collision point)
        // Final validation: ensure position is not in a wall
        if (isWall(finalX, finalY)) {
            console.error(`CRITICAL: Dash collision position is in wall at (${finalX}, ${finalY}), correcting...`);
            const validPos = findNearestValidPosition(finalX, finalY);
            finalX = validPos.x;
            finalY = validPos.y;
        }
        
        player.x = finalX;
        player.y = finalY;
        player.targetX = finalX;
        player.targetY = finalY;
        player.isDashing = true;
        // Set cooldown to exactly 2.0 seconds (DASH_COOLDOWN) - server is authoritative
        player.dashCooldownEndTime = currentTime + DASH_COOLDOWN;
        player.lastUpdate = Date.now();
        
        // Final check after setting position
        if (isWall(player.x, player.y)) {
            console.error(`CRITICAL: Player ${playerId} ended up in wall after dash collision, correcting...`);
            const validPos = findNearestValidPosition(player.x, player.y);
            player.x = validPos.x;
            player.y = validPos.y;
            player.targetX = validPos.x;
            player.targetY = validPos.y;
            return { success: false, positionCorrected: true };
        }
        
        // Reset dash flag after a short delay
        setTimeout(() => {
            const p = gameState.players.get(playerId);
            if (p) p.isDashing = false;
        }, 300);
        
        // Return collision info for visual feedback
        return { 
            success: true, 
            collision: true, 
            targetPlayerId: hitPlayer.id,
            targetPlayerHealth: hitPlayer.health,
            damageDealt: damageDealt
        };
    }
    
    // Normal dash completion
    // Final validation: ensure final position is not in a wall
    if (isWall(finalX, finalY)) {
        console.error(`CRITICAL: Dash final position is in wall at (${finalX}, ${finalY}), correcting...`);
        const validPos = findNearestValidPosition(finalX, finalY);
        finalX = validPos.x;
        finalY = validPos.y;
    }
    
    player.x = finalX;
    player.y = finalY;
    player.targetX = finalX;
    player.targetY = finalY;
    player.isDashing = true;
    // Set cooldown to exactly 2.0 seconds (DASH_COOLDOWN) - server is authoritative
    player.dashCooldownEndTime = currentTime + DASH_COOLDOWN;
    player.lastUpdate = Date.now();
    
    // Final check after setting position
    if (isWall(player.x, player.y)) {
        console.error(`CRITICAL: Player ${playerId} ended up in wall after dash at (${player.x}, ${player.y}), correcting...`);
        const validPos = findNearestValidPosition(player.x, player.y);
        player.x = validPos.x;
        player.y = validPos.y;
        player.targetX = validPos.x;
        player.targetY = validPos.y;
        return { success: false, positionCorrected: true };
    }
    
    // Reset dash flag after a short delay
    setTimeout(() => {
        const p = gameState.players.get(playerId);
        if (p) p.isDashing = false;
    }, 300);
    
    return { success: true };
}

// Process mana ability
function processMana(playerId) {
    const player = gameState.players.get(playerId);
    if (!player) return false;
    
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
            
            // Notify client that mana cast completed
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) {
                playerSocket.emit('manaCastComplete', {
                    health: p.health,
                    isCastingMana: false
                });
                // Broadcast health change to ALL players so everyone sees correct health
                io.emit('playerHealthChanged', {
                    id: playerId,
                    health: p.health
                });
            }
        }
    }, MANA_CAST_TIME * 1000);
    
    return true;
}

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
        mapSeed: mapSeed
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
        
        // Check if cooldowns expired (was active, now inactive)
        const lastDashCooldown = lastState ? lastState.dashCooldownEndTime : null;
        const currentDashCooldown = player.dashCooldownEndTime;
        const dashCooldownWasActive = lastDashCooldown && lastDashCooldown > 0;
        const dashCooldownIsActive = currentDashCooldown > now;
        const dashCooldownExpired = dashCooldownWasActive && !dashCooldownIsActive;
        
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
                manaCooldownExpired
            );
        }
        
        if (hasChanged) {
            // Include cooldown times if they're active OR if they just expired (send 0 to clear client state)
            if (player.dashCooldownEndTime > now) {
                playerData.dashCooldownEndTime = player.dashCooldownEndTime;
            } else if (dashCooldownExpired) {
                // Cooldown expired - explicitly send 0 to clear client state
                playerData.dashCooldownEndTime = 0;
            }
            if (player.manaCooldownEndTime > now) {
                playerData.manaCooldownEndTime = player.manaCooldownEndTime;
            } else if (manaCooldownExpired) {
                // Cooldown expired - explicitly send 0 to clear client state
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

// Socket.io connection handling
io.on('connection', (socket) => {
    const playerId = socket.id;
    console.log('Player connected:', playerId);
    
    // Clean up any existing player with this ID (shouldn't happen, but safety check)
    if (gameState.players.has(playerId)) {
        console.warn(`Warning: Player ${playerId} already exists, cleaning up old instance`);
        removePlayer(playerId);
    }
    
    // Ensure game is initialized (should already be, but double-check)
    if (!gameInitialized) {
        initGame();
    }
    
    console.log('Total players in game:', gameState.players.size);
    
    // Create player
    const player = createPlayer(playerId);
    
    // Send initial game state with consistent map seed
    socket.emit('gameState', {
        playerId: playerId,
        player: {
            x: player.x,
            y: player.y,
            targetX: player.targetX,
            targetY: player.targetY,
            health: player.health,
            maxHealth: player.maxHealth,
            dashCooldownEndTime: player.dashCooldownEndTime,
            manaCooldownEndTime: player.manaCooldownEndTime,
            isDashing: player.isDashing,
            isCastingMana: player.isCastingMana,
            manaCastEndTime: player.manaCastEndTime,
            color: player.color
        },
        mapSeed: mapSeed, // Always the same seed for all players
        otherPlayers: Array.from(gameState.players.values())
            .filter(p => p.id !== playerId)
            .map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                targetX: p.targetX,
                targetY: p.targetY,
                health: p.health,
                maxHealth: p.maxHealth,
                dashCooldownEndTime: p.dashCooldownEndTime,
                manaCooldownEndTime: p.manaCooldownEndTime,
                isDashing: p.isDashing,
                isCastingMana: p.isCastingMana,
                manaCastEndTime: p.manaCastEndTime,
                color: p.color
            }))
    });
    
    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', {
        id: player.id,
        x: player.x,
        y: player.y,
        targetX: player.targetX,
        targetY: player.targetY,
        health: player.health,
        maxHealth: player.maxHealth,
        dashCooldownEndTime: player.dashCooldownEndTime,
        manaCooldownEndTime: player.manaCooldownEndTime,
        isDashing: player.isDashing,
        isCastingMana: player.isCastingMana,
        manaCastEndTime: player.manaCastEndTime,
        color: player.color
    });
    
    // Input rate limiting - prevent spam
    let lastMoveTime = 0;
    const MOVE_RATE_LIMIT = 100; // Minimum milliseconds between moves (10 moves/sec max)
    let moveCount = 0;
    let moveCountResetTime = Date.now();
    
    // Handle movement
    socket.on('move', (action) => {
        const player = gameState.players.get(playerId);
        if (!player) return;
        
        // Rate limiting: prevent more than 10 moves per second
        const now = Date.now();
        if (now - moveCountResetTime >= 1000) {
            moveCount = 0;
            moveCountResetTime = now;
        }
        if (moveCount >= 10) {
            // Too many moves, ignore this one
            return;
        }
        if (now - lastMoveTime < MOVE_RATE_LIMIT) {
            // Too soon since last move, ignore
            return;
        }
        
        lastMoveTime = now;
        moveCount++;
        
        // Validate current position is valid (not in a wall)
        if (isWall(player.x, player.y)) {
            // Player is in a wall! Find nearest valid position
            console.warn(`Player ${playerId} is in a wall at (${player.x}, ${player.y}), correcting...`);
            const validPos = findNearestValidPosition(player.x, player.y);
            player.x = validPos.x;
            player.y = validPos.y;
            player.targetX = validPos.x;
            player.targetY = validPos.y;
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: 'position_corrected'
            });
        }
        
        const result = processMovement(playerId, action);
        
        // Handle collision damage notification - unified playerHit event
        // This must be checked BEFORE the success check because collisions return success: false
        if (result.collision && result.targetPlayerId) {
            const targetPlayer = gameState.players.get(result.targetPlayerId);
            const attackerPlayer = gameState.players.get(playerId);
                if (targetPlayer && attackerPlayer) {
                    // Send unified hit event for visual feedback
                    // Only send damage if it was actually dealt (not on cooldown)
                    const damageDealt = result.damageDealt ? 1 : 0;
                    io.emit('playerHit', {
                        attackerId: playerId,
                        targetId: result.targetPlayerId,
                        damageDealt: damageDealt,
                        targetNewHealth: targetPlayer.health,
                        attackerX: attackerPlayer.x,
                        attackerY: attackerPlayer.y,
                        targetX: targetPlayer.x,
                        targetY: targetPlayer.y
                    });
                    
                    // Send health change only if damage was actually dealt
                    if (result.damageDealt) {
                        io.emit('playerHealthChanged', {
                            id: result.targetPlayerId,
                            health: targetPlayer.health
                        });
                    }
                }
            }
        
        if (result.success) {
            socket.broadcast.emit('playerMoved', {
                id: playerId,
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY
            });
            socket.emit('moveConfirmed', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY
            });
        } else {
            // Movement was rejected - send current position to correct client
            // If position was corrected, always send rejection to sync client
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: result.positionCorrected ? 'position_corrected' : (result.collision ? 'blocked_by_player' : 'blocked')
            });
        }
    });
    
    // Dash rate limiting
    let lastDashTime = 0;
    const DASH_RATE_LIMIT = 300; // Minimum milliseconds between dashes
    
    // Handle dash
    socket.on('dash', (direction) => {
        const player = gameState.players.get(playerId);
        if (!player) return;
        
        // Rate limiting for dash
        const now = Date.now();
        if (now - lastDashTime < DASH_RATE_LIMIT) {
            // Too soon since last dash, ignore
            return;
        }
        lastDashTime = now;
        
        // Validate current position is valid (not in a wall)
        if (isWall(player.x, player.y)) {
            // Player is in a wall! Find nearest valid position
            console.warn(`Player ${playerId} is in a wall at (${player.x}, ${player.y}), correcting...`);
            const validPos = findNearestValidPosition(player.x, player.y);
            player.x = validPos.x;
            player.y = validPos.y;
            player.targetX = validPos.x;
            player.targetY = validPos.y;
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: 'position_corrected'
            });
        }
        
        const result = processDash(playerId, direction);
        
        // Handle collision damage notification - unified playerHit event
        // This must be checked BEFORE the success check because collisions can occur
        if (result.collision && result.targetPlayerId) {
            const targetPlayer = gameState.players.get(result.targetPlayerId);
            const attackerPlayer = gameState.players.get(playerId);
                if (targetPlayer && attackerPlayer) {
                    // Send unified hit event for visual feedback
                    // Only send damage if it was actually dealt (not on cooldown)
                    const damageDealt = result.damageDealt ? 1 : 0;
                    io.emit('playerHit', {
                        attackerId: playerId,
                        targetId: result.targetPlayerId,
                        damageDealt: damageDealt,
                        targetNewHealth: targetPlayer.health,
                        attackerX: attackerPlayer.x,
                        attackerY: attackerPlayer.y,
                        targetX: targetPlayer.x,
                        targetY: targetPlayer.y
                    });
                    
                    // Send health change only if damage was actually dealt
                    if (result.damageDealt) {
                        io.emit('playerHealthChanged', {
                            id: result.targetPlayerId,
                            health: targetPlayer.health
                        });
                    }
                }
            }
        
        if (result.success) {
            socket.broadcast.emit('playerDashed', {
                id: playerId,
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                dashCooldownEndTime: player.dashCooldownEndTime
            });
            socket.emit('dashConfirmed', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                dashCooldownEndTime: player.dashCooldownEndTime
            });
        } else {
            // Dash was rejected - send current position to correct client
            // If position was corrected, always send rejection to sync client
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: result.positionCorrected ? 'position_corrected' : 'dash_blocked'
            });
        }
    });
    
    // Handle mana
    socket.on('mana', () => {
        if (processMana(playerId)) {
            const player = gameState.players.get(playerId);
            socket.broadcast.emit('playerMana', {
                id: playerId,
                manaCooldownEndTime: player.manaCooldownEndTime,
                manaCastEndTime: player.manaCastEndTime,
                isCastingMana: player.isCastingMana
            });
            socket.emit('manaConfirmed', {
                manaCooldownEndTime: player.manaCooldownEndTime,
                manaCastEndTime: player.manaCastEndTime,
                isCastingMana: player.isCastingMana
            });
        }
    });
    
    // Handle health update (for testing)
    socket.on('updateHealth', (health) => {
        const player = gameState.players.get(playerId);
        if (player) {
            player.health = Math.max(0, Math.min(MAX_HEALTH, health));
            // Broadcast to ALL players so everyone sees correct health
            io.emit('playerHealthChanged', {
                id: playerId,
                health: player.health
            });
        }
    });
    
    // Track last sent state for delta compression
    let lastSentState = new Map(); // playerId -> last sent state hash
    
    // Periodic state sync (every 250ms = 4Hz, reduced from 100ms for better performance)
    const syncInterval = setInterval(() => {
        // Check if socket is still connected
        if (!socket.connected) {
            console.log(`Socket ${playerId} no longer connected, cleaning up`);
            clearInterval(syncInterval);
            removePlayer(playerId);
            socket.broadcast.emit('playerLeft', { id: playerId });
            return;
        }
        
        // Validate player position is not in a wall
        const player = gameState.players.get(playerId);
        if (!player) {
            // Player was already removed, stop syncing
            clearInterval(syncInterval);
            return;
        }
        
        if (isWall(player.x, player.y)) {
            console.warn(`Player ${playerId} detected in wall during sync, correcting...`);
            const validPos = findNearestValidPosition(player.x, player.y);
            player.x = validPos.x;
            player.y = validPos.y;
            player.targetX = validPos.x;
            player.targetY = validPos.y;
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: 'position_corrected_sync'
            });
        }
        
        // Get snapshot with delta compression (only send changed data)
        const snapshot = getGameStateSnapshotDelta(playerId, lastSentState);
        if (snapshot.players.length > 0) { // Only send if there are changes
            socket.emit('gameStateUpdate', snapshot);
            // Update last sent state for all players (including unchanged ones for tracking)
            const now = Date.now() / 1000;
            for (const [id, p] of gameState.players.entries()) {
                if (id !== playerId) {
                    const lastState = lastSentState.get(id);
                    const currentState = {
                        x: p.x,
                        y: p.y,
                        targetX: p.targetX,
                        targetY: p.targetY,
                        health: p.health,
                        isDashing: p.isDashing,
                        isCastingMana: p.isCastingMana,
                        dashCooldownEndTime: p.dashCooldownEndTime > now ? p.dashCooldownEndTime : 0,
                        manaCooldownEndTime: p.manaCooldownEndTime > now ? p.manaCooldownEndTime : 0
                    };
                    // Only update if this player was in the snapshot (changed) or if we don't have last state
                    const wasInSnapshot = snapshot.players.some(sp => sp.id === id);
                    if (wasInSnapshot || !lastState) {
                        lastSentState.set(id, currentState);
                    }
                }
            }
        }
    }, 250); // Reduced from 100ms to 250ms (4Hz instead of 10Hz)
    
    // Handle disconnect
    socket.on('disconnect', (reason) => {
        console.log(`Player disconnected: ${playerId}, reason: ${reason}`);
        clearInterval(syncInterval);
        const wasRemoved = removePlayer(playerId);
        if (wasRemoved) {
            socket.broadcast.emit('playerLeft', { id: playerId });
        }
    });
    
    // Handle client disconnecting (before disconnect event)
    socket.on('disconnecting', () => {
        console.log(`Player disconnecting: ${playerId}`);
    });
});

// Periodic cleanup of disconnected players (every 5 seconds)
setInterval(() => {
    const connectedSocketIds = new Set();
    io.sockets.sockets.forEach((socket) => {
        if (socket.connected) {
            connectedSocketIds.add(socket.id);
        }
    });
    
    // Remove any players whose sockets are no longer connected
    const playersToRemove = [];
    for (const [playerId, player] of gameState.players.entries()) {
        if (!connectedSocketIds.has(playerId)) {
            playersToRemove.push(playerId);
        }
    }
    
    if (playersToRemove.length > 0) {
        console.log(`Cleaning up ${playersToRemove.length} disconnected player(s):`, playersToRemove);
        for (const playerId of playersToRemove) {
            removePlayer(playerId);
            io.emit('playerLeft', { id: playerId });
        }
    }
}, 5000); // Check every 5 seconds

// Get LAN IP address
function getLANIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Skip link-local addresses (169.254.x.x)
                if (!iface.address.startsWith('169.254.')) {
                    return iface.address;
                }
            }
        }
    }
    return null;
}

// Start server
const PORT = process.env.PORT || 3000;

// Initialize game before starting server
initGame();

server.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLANIP();
    console.log(`Server running on http://localhost:${PORT}`);
    if (lanIP) {
        console.log(`LAN server IP: http://${lanIP}:${PORT}`);
    } else {
        console.log(`LAN server IP: Unable to detect (find your IP with: ipconfig)`);
    }
    console.log(`Map seed: ${mapSeed} (fixed - all players will see the same map)`);
    console.log(`Game instance ready - all players will join this same game`);
});

