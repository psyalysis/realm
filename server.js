// ============================================================================
// MULTIPLAYER SERVER - MAIN ENTRY POINT
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

// Import modules
const { gameState, isGameInitialized, setGameInitialized } = require('./server/gameState.js');
const { generateMap, getMap, setMap, getMapSeed, setMapSeed, isWall, findNearestValidPosition } = require('./server/map.js');
const { createPlayer, removePlayer, getPlayerAtPosition, dealDamageToPlayer, respawnPlayer, checkRespawns, clearSpawnPositions } = require('./server/player.js');
const { processMovement } = require('./server/movement.js');
const { processDash, processMana } = require('./server/abilities.js');
const { getGameStateSnapshot, getGameStateSnapshotDelta } = require('./server/sync.js');
const { FIXED_MAP_SEED, MAX_HEALTH, MOVE_RATE_LIMIT, DASH_RATE_LIMIT, SYNC_INTERVAL } = require('./server/config.js');

// Initialize game
function initGame() {
    if (isGameInitialized()) {
        return; // Already initialized
    }
    
    console.log('Initializing game...');
    
    // Generate map with fixed seed
    setMapSeed(FIXED_MAP_SEED);
    generateMap(FIXED_MAP_SEED);
    gameState.map = getMap();
    
    // Clear spawn positions
    clearSpawnPositions();
    
    setGameInitialized(true);
    console.log('Game initialized');
}

// Socket.io connection handling
io.on('connection', (socket) => {
    const playerId = socket.id;
    console.log('Player connected:', playerId);
    
    if (gameState.players.has(playerId)) {
        console.warn(`Warning: Player ${playerId} already exists, cleaning up old instance`);
        removePlayer(playerId);
    }
    
    if (!isGameInitialized()) {
        initGame();
    }
    
    console.log('Total players in game:', gameState.players.size);
    
    const player = createPlayer(playerId);
    
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
            isDead: player.isDead,
            color: player.color
        },
        mapSeed: getMapSeed(),
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
        isDead: player.isDead,
        color: player.color
    });
    
    let lastMoveTime = 0;
    let moveCount = 0;
    let moveCountResetTime = Date.now();
    
    socket.on('move', (action) => {
        const player = gameState.players.get(playerId);
        if (!player) return;
        
        const now = Date.now();
        const currentTime = now / 1000;
        
        // Check if player is dashing (has active dash speed boost)
        const isDashing = player.dashEndTime && player.dashEndTime > currentTime;
        
        // During dash, allow 4x faster movement (reduce rate limit by 4x)
        const effectiveRateLimit = isDashing ? MOVE_RATE_LIMIT / 4 : MOVE_RATE_LIMIT;
        
        if (now - moveCountResetTime >= 1000) {
            moveCount = 0;
            moveCountResetTime = now;
        }
        if (moveCount >= 10) {
            return;
        }
        if (now - lastMoveTime < effectiveRateLimit) {
            return;
        }
        
        lastMoveTime = now;
        moveCount++;
        
        if (isWall(player.x, player.y)) {
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
        
        if (result.collision && result.targetPlayerId) {
            const targetPlayer = gameState.players.get(result.targetPlayerId);
            const attackerPlayer = gameState.players.get(playerId);
            if (targetPlayer && attackerPlayer) {
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
                
                if (result.damageDealt) {
                    io.emit('playerHealthChanged', {
                        id: result.targetPlayerId,
                        health: targetPlayer.health
                    });
                    
                    // Check if player died
                    if (targetPlayer.isDead) {
                        io.emit('playerDied', {
                            id: result.targetPlayerId,
                            respawnTime: targetPlayer.respawnTime,
                            x: targetPlayer.x,
                            y: targetPlayer.y
                        });
                        // Emit death burst effect
                        io.emit('playerDeathBurst', {
                            id: result.targetPlayerId,
                            x: targetPlayer.x,
                            y: targetPlayer.y,
                            color: targetPlayer.color
                        });
                    }
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
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: result.positionCorrected ? 'position_corrected' : (result.collision ? 'blocked_by_player' : 'blocked')
            });
        }
    });
    
    let lastDashTime = 0;
    
    socket.on('dash', (direction) => {
        const player = gameState.players.get(playerId);
        if (!player) return;
        
        const now = Date.now();
        if (now - lastDashTime < DASH_RATE_LIMIT) {
            return;
        }
        lastDashTime = now;
        
        const result = processDash(playerId, direction);
        
        if (result.success) {
            socket.broadcast.emit('playerDashed', {
                id: playerId,
                dashEndTime: player.dashEndTime,
                dashDirection: player.dashDirection,
                dashCooldownEndTime: player.dashCooldownEndTime
            });
            socket.emit('dashConfirmed', {
                dashEndTime: player.dashEndTime,
                dashDirection: player.dashDirection,
                dashCooldownEndTime: player.dashCooldownEndTime
            });
        } else {
            socket.emit('moveRejected', {
                x: player.x,
                y: player.y,
                targetX: player.targetX,
                targetY: player.targetY,
                reason: result.positionCorrected ? 'position_corrected' : 'dash_blocked'
            });
        }
    });
    
    socket.on('mana', () => {
        if (processMana(playerId, io)) {
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
    
    socket.on('updateHealth', (health) => {
        const player = gameState.players.get(playerId);
        if (player) {
            player.health = Math.max(0, Math.min(MAX_HEALTH, health));
            io.emit('playerHealthChanged', {
                id: playerId,
                health: player.health
            });
        }
    });
    
    let lastSentState = new Map();
    
    const syncInterval = setInterval(() => {
        if (!socket.connected) {
            console.log(`Socket ${playerId} no longer connected, cleaning up`);
            clearInterval(syncInterval);
            removePlayer(playerId);
            socket.broadcast.emit('playerLeft', { id: playerId });
            return;
        }
        
        // Check for respawns
        checkRespawns(io);
        
        const player = gameState.players.get(playerId);
        if (!player) {
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
        
        const snapshot = getGameStateSnapshotDelta(playerId, lastSentState);
        if (snapshot.players.length > 0) {
            socket.emit('gameStateUpdate', snapshot);
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
                        isDead: p.isDead,
                        dashCooldownEndTime: p.dashCooldownEndTime > now ? p.dashCooldownEndTime : 0,
                        manaCooldownEndTime: p.manaCooldownEndTime > now ? p.manaCooldownEndTime : 0
                    };
                    const wasInSnapshot = snapshot.players.some(sp => sp.id === id);
                    if (wasInSnapshot || !lastState) {
                        lastSentState.set(id, currentState);
                    }
                }
            }
        }
    }, SYNC_INTERVAL);
    
    socket.on('disconnect', (reason) => {
        console.log(`Player disconnected: ${playerId}, reason: ${reason}`);
        clearInterval(syncInterval);
        const wasRemoved = removePlayer(playerId);
        if (wasRemoved) {
            socket.broadcast.emit('playerLeft', { id: playerId });
        }
    });
    
    socket.on('disconnecting', () => {
        console.log(`Player disconnecting: ${playerId}`);
    });
});

// Periodic cleanup
setInterval(() => {
    const connectedSocketIds = new Set();
    io.sockets.sockets.forEach((socket) => {
        if (socket.connected) {
            connectedSocketIds.add(socket.id);
        }
    });
    
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
}, 5000);

// Get LAN IP address
function getLANIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
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

initGame();

server.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLANIP();
    console.log(`Server running on http://localhost:${PORT}`);
    if (lanIP) {
        console.log(`LAN server IP: http://${lanIP}:${PORT}`);
    } else {
        console.log(`LAN server IP: Unable to detect (find your IP with: ipconfig)`);
    }
    console.log(`Map seed: ${getMapSeed()} (fixed - all players will see the same map)`);
});

