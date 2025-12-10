// ============================================================================
// MULTIPLAYER NETWORKING
// ============================================================================

import { gameState, setPreviousHealth } from './gameState.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { generateMapFromSeed, isWall, findNearestValidPosition, initEmptyMap, getMap } from './map.js';
import { centerCameraOnRedSquare } from './camera.js';
import { updateHealthBar, updateManaBar, updateGameRunningStatus, updateNetworkState } from './abilities.js';
import { addOtherPlayer, removeOtherPlayer, updateOtherPlayer, updateOtherPlayerPosition, triggerOtherPlayerDamageEffect, otherPlayers } from './player.js';
import { triggerHitCameraEffect, getCameraInterpolated } from './camera.js';
import { triggerHitFeedback, forceUpdateHealthDots } from './renderer.js';
import { gridToWorldPixels, worldToViewport } from './utils.js';

// Network state
let socket = null;
let isConnected = false;
let myPlayerId = null;
let mapSeed = null;

// Callbacks (will be set during initialization)
let redSquare, render;
let worldElement = null;
let currentTileSize = 0;

// Death UI management
let deathOverlay = null;
let deathMessage = null;
let respawnCountdown = null;
let respawnCountdownInterval = null;

function initDeathUI() {
    deathOverlay = document.getElementById('deathOverlay');
    deathMessage = document.getElementById('deathMessage');
    respawnCountdown = document.getElementById('respawnCountdown');
}

function showDeathUI() {
    if (!deathOverlay) initDeathUI();
    if (deathOverlay) {
        deathOverlay.classList.add('active');
        updateRespawnCountdown();
        if (respawnCountdownInterval) {
            clearInterval(respawnCountdownInterval);
        }
        respawnCountdownInterval = setInterval(updateRespawnCountdown, 100);
    }
}

function hideDeathUI() {
    if (!deathOverlay) initDeathUI();
    if (deathOverlay) {
        deathOverlay.classList.remove('active');
        if (respawnCountdownInterval) {
            clearInterval(respawnCountdownInterval);
            respawnCountdownInterval = null;
        }
    }
}

function updateRespawnCountdown() {
    if (!respawnCountdown || !gameState.isDead) return;
    
    const now = performance.now() / 1000;
    const timeRemaining = Math.max(0, gameState.respawnTime - now);
    
    if (timeRemaining <= 0) {
        respawnCountdown.textContent = 'Respawning...';
    } else {
        respawnCountdown.textContent = `Respawning in ${Math.ceil(timeRemaining)}s`;
    }
}

// Death burst effect
function triggerDeathBurst(gridX, gridY, isLocalPlayer, playerColor) {
    if (!worldElement || currentTileSize === 0) return;
    
    // Use player's color or default to red
    const particleColor = playerColor || '#ff0000';
    
    // Calculate position in world pixels (relative to world element)
    const worldPixels = gridToWorldPixels(gridX, gridY, currentTileSize);
    
    // Create burst container
    const burstContainer = document.createElement('div');
    burstContainer.className = 'death-burst';
    burstContainer.style.left = (worldPixels.x + currentTileSize / 2) + 'px';
    burstContainer.style.top = (worldPixels.y + currentTileSize / 2) + 'px';
    burstContainer.style.position = 'absolute';
    burstContainer.style.pointerEvents = 'none';
    burstContainer.style.zIndex = '1000';
    
    // Create particles
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'death-particle';
        particle.style.backgroundColor = particleColor;
        const angle = (i / particleCount) * Math.PI * 2;
        const distance = currentTileSize * 2.5; // Travel much further
        particle.style.setProperty('--angle', angle + 'rad');
        particle.style.setProperty('--distance', distance + 'px');
        burstContainer.appendChild(particle);
    }
    
    worldElement.appendChild(burstContainer);
    
    // Remove after animation
    setTimeout(() => {
        if (burstContainer.parentNode) {
            burstContainer.remove();
        }
    }, 800);
}

export function updateTileSize(newTileSize) {
    currentTileSize = newTileSize;
}

export function initNetwork(callbacks) {
    redSquare = callbacks.redSquare;
    render = callbacks.render;
    worldElement = callbacks.world;
    currentTileSize = callbacks.tileSize || 0;
    
    initDeathUI();
    
    const serverUrl = window.location.origin;
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        isConnected = true;
        updateNetworkState({ socket, isConnected, myPlayerId });
        updateGameRunningStatus();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        updateNetworkState({ socket, isConnected, myPlayerId });
        updateGameRunningStatus();
    });
    
    setTimeout(() => {
        updateNetworkState({ socket, isConnected, myPlayerId });
        updateGameRunningStatus();
    }, 1000);
    
    socket.on('gameState', (data) => {
        console.log('Received game state:', data);
        myPlayerId = data.playerId;
        mapSeed = data.mapSeed;
        updateNetworkState({ socket, isConnected, myPlayerId });
        updateGameRunningStatus();
        
        gameState.player.x = data.player.x;
        gameState.player.y = data.player.y;
        gameState.playerTarget.x = data.player.targetX;
        gameState.playerTarget.y = data.player.targetY;
        gameState.playerInterpolated.x = data.player.x;
        gameState.playerInterpolated.y = data.player.y;
        setPreviousHealth(data.player.health);
        gameState.health = data.player.health;
        gameState.maxHealth = data.player.maxHealth;
        
        if (data.player.color && redSquare) {
            gameState.playerColor = data.player.color;
            redSquare.style.backgroundColor = data.player.color;
        }
        
        const now = performance.now() / 1000;
        if (data.player.dashCooldownEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilDash = data.player.dashCooldownEndTime - serverNow;
            gameState.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
        } else {
            gameState.dashCooldownEndTime = 0;
        }
        
        if (data.player.dashEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilDashEnd = data.player.dashEndTime - serverNow;
            gameState.dashEndTime = now + Math.max(0, timeUntilDashEnd);
            gameState.dashDirection = data.player.dashDirection || null;
            gameState.isDashing = true;
        } else {
            gameState.dashEndTime = 0;
            gameState.dashDirection = null;
            gameState.isDashing = false;
        }
        
        if (data.player.manaCooldownEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilMana = data.player.manaCooldownEndTime - serverNow;
            gameState.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        } else {
            gameState.manaCooldownEndTime = 0;
        }
        gameState.isCastingMana = data.player.isCastingMana;
        gameState.isDead = data.player.isDead || false;
        
        if (data.player.manaCastEndTime > 0) {
            const serverNow = Date.now() / 1000;
            const timeUntilCastComplete = data.player.manaCastEndTime - serverNow;
            gameState.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
        } else {
            gameState.manaCastEndTime = 0;
        }
        
        if (gameState.isDead) {
            showDeathUI();
        } else {
            hideDeathUI();
        }
        
        generateMapFromSeed(mapSeed);
        
        // Ensure map is properly initialized after regeneration
        const map = getMap();
        if (!map || map.length === 0) {
            console.warn('Map regeneration failed, initializing empty map');
            initEmptyMap();
        }
        
        for (const playerData of data.otherPlayers) {
            addOtherPlayer(playerData);
        }
        
        updateHealthBar();
        updateManaBar();
        centerCameraOnRedSquare();
        
        if (render) render();
    });
    
    socket.on('gameStateUpdate', (data) => {
        for (const playerData of data.players) {
            updateOtherPlayer(playerData);
        }
    });
    
    socket.on('playerJoined', (playerData) => {
        console.log('Player joined:', playerData.id);
        addOtherPlayer(playerData);
    });
    
    socket.on('playerLeft', (data) => {
        console.log('Player left:', data.id);
        removeOtherPlayer(data.id);
    });
    
    socket.on('moveConfirmed', (data) => {
        const diffX = Math.abs(gameState.player.x - data.x);
        const diffY = Math.abs(gameState.player.y - data.y);
        
        if (diffX > 0.1 || diffY > 0.1) {
            gameState.player.x = data.x;
            gameState.player.y = data.y;
            gameState.playerTarget.x = data.targetX;
            gameState.playerTarget.y = data.targetY;
        } else {
            gameState.playerTarget.x = data.targetX;
            gameState.playerTarget.y = data.targetY;
        }
        
        if (!gameState.isHitEffectActive) {
            centerCameraOnRedSquare();
        }
    });
    
    socket.on('moveRejected', (data) => {
        gameState.player.x = data.x;
        gameState.player.y = data.y;
        gameState.playerTarget.x = data.targetX;
        gameState.playerTarget.y = data.targetY;
        gameState.playerInterpolated.x = data.x;
        gameState.playerInterpolated.y = data.y;
        gameState.movementQueue = [];
        
        if (data.reason !== 'blocked_by_player') {
            centerCameraOnRedSquare();
        }
        
        if (isWall(gameState.player.x, gameState.player.y)) {
            console.warn('Server sent invalid position in moveRejected, correcting...');
            const validPos = findNearestValidPosition(gameState.player.x, gameState.player.y);
            gameState.player.x = validPos.x;
            gameState.player.y = validPos.y;
            gameState.playerTarget.x = validPos.x;
            gameState.playerTarget.y = validPos.y;
            gameState.playerInterpolated.x = validPos.x;
            gameState.playerInterpolated.y = validPos.y;
        }
    });
    
    socket.on('playerMoved', (data) => {
        updateOtherPlayerPosition(data.id, data.x, data.y, data.targetX, data.targetY);
    });
    
    socket.on('dashConfirmed', (data) => {
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        
        if (data.dashEndTime > 0) {
            const timeUntilDashEnd = data.dashEndTime - serverNow;
            gameState.dashEndTime = now + Math.max(0, timeUntilDashEnd);
            gameState.dashDirection = data.dashDirection || null;
            gameState.isDashing = true;
        }
        
        if (data.dashCooldownEndTime > 0) {
            const timeUntilDash = data.dashCooldownEndTime - serverNow;
            gameState.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
        } else {
            gameState.dashCooldownEndTime = 0;
        }
    });
    
    socket.on('playerDashed', (data) => {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            
            if (data.dashEndTime > 0) {
                const timeUntilDashEnd = data.dashEndTime - serverNow;
                otherPlayer.dashEndTime = now + Math.max(0, timeUntilDashEnd);
                otherPlayer.dashDirection = data.dashDirection || null;
                otherPlayer.isDashing = true;
            }
            
            if (data.dashCooldownEndTime > 0) {
                const timeUntilDash = data.dashCooldownEndTime - serverNow;
                otherPlayer.dashCooldownEndTime = now + Math.max(0, timeUntilDash);
            }
        }
    });
    
    socket.on('manaConfirmed', (data) => {
        const now = performance.now() / 1000;
        const serverNow = Date.now() / 1000;
        
        if (data.manaCooldownEndTime > 0) {
            const timeUntilMana = data.manaCooldownEndTime - serverNow;
            gameState.manaCooldownEndTime = now + Math.max(0, timeUntilMana);
        } else {
            gameState.manaCooldownEndTime = 0;
        }
        
        if (data.manaCastEndTime > 0) {
            const timeUntilCastComplete = data.manaCastEndTime - serverNow;
            gameState.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
        } else {
            gameState.manaCastEndTime = 0;
        }
        
        gameState.isCastingMana = data.isCastingMana;
    });
    
    socket.on('playerMana', (data) => {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.manaCooldownEndTime = data.manaCooldownEndTime;
            const now = performance.now() / 1000;
            const serverNow = Date.now() / 1000;
            if (data.manaCastEndTime > 0) {
                const timeUntilCastComplete = data.manaCastEndTime - serverNow;
                otherPlayer.manaCastEndTime = now + Math.max(0, timeUntilCastComplete);
            } else {
                otherPlayer.manaCastEndTime = 0;
            }
            otherPlayer.isCastingMana = data.isCastingMana;
        }
    });
    
    socket.on('playerHealthChanged', (data) => {
        if (data.id === myPlayerId) {
            const oldHealth = gameState.health;
            gameState.health = data.health;
            if (oldHealth !== data.health) {
                setPreviousHealth(oldHealth);
                updateHealthBar();
            }
        } else {
            const otherPlayer = otherPlayers.get(data.id);
            if (otherPlayer) {
                otherPlayer.health = data.health;
                forceUpdateHealthDots(otherPlayer);
            }
        }
    });
    
    socket.on('playerHit', (data) => {
        const isAttacker = data.attackerId === myPlayerId;
        const isTarget = data.targetId === myPlayerId;
        
        if (isAttacker) {
            triggerHitCameraEffect(data.targetX, data.targetY, false);
            triggerHitFeedback(data.targetId, data.targetX, data.targetY, false);
        }
        
        if (isTarget) {
            triggerHitCameraEffect(data.attackerX, data.attackerY, true);
            triggerHitFeedback(data.attackerId, data.attackerX, data.attackerY, true);
            const oldHealth = gameState.health;
            gameState.health = data.targetNewHealth;
            if (oldHealth !== data.targetNewHealth) {
                setPreviousHealth(oldHealth);
                updateHealthBar();
            } else if (data.damageDealt > 0) {
                setPreviousHealth(oldHealth);
                updateHealthBar();
            }
            
            // Check if player died (health reached 0)
            if (data.targetNewHealth <= 0 && !gameState.isDead) {
                gameState.isDead = true;
                showDeathUI();
            }
        }
        
        if (!isAttacker && !isTarget) {
            const otherPlayer = otherPlayers.get(data.targetId);
            if (otherPlayer) {
                const oldHealth = otherPlayer.health;
                otherPlayer.health = data.targetNewHealth;
                forceUpdateHealthDots(otherPlayer);
                if (data.damageDealt > 0 && oldHealth > data.targetNewHealth) {
                    triggerOtherPlayerDamageEffect(data.targetId);
                }
            }
        }
    });
    
    socket.on('manaCastComplete', (data) => {
        gameState.health = data.health;
        gameState.isCastingMana = false;
        gameState.manaCastEndTime = 0;
        setPreviousHealth(gameState.health);
        updateHealthBar();
    });
    
    socket.on('playerDied', (data) => {
        if (data.id === myPlayerId) {
            gameState.isDead = true;
            const serverNow = Date.now() / 1000;
            const now = performance.now() / 1000;
            const timeUntilRespawn = data.respawnTime - serverNow;
            gameState.respawnTime = now + Math.max(0, timeUntilRespawn);
            showDeathUI();
        } else {
            const otherPlayer = otherPlayers.get(data.id);
            if (otherPlayer) {
                otherPlayer.isDead = true;
            }
        }
    });
    
    socket.on('playerRespawned', (data) => {
        if (data.id === myPlayerId) {
            gameState.isDead = false;
            gameState.respawnTime = 0;
            gameState.health = data.health;
            gameState.player.x = data.x;
            gameState.player.y = data.y;
            gameState.playerTarget.x = data.targetX;
            gameState.playerTarget.y = data.targetY;
            gameState.playerInterpolated.x = data.x;
            gameState.playerInterpolated.y = data.y;
            setPreviousHealth(data.health);
            updateHealthBar();
            hideDeathUI();
            centerCameraOnRedSquare();
        } else {
            const otherPlayer = otherPlayers.get(data.id);
            if (otherPlayer) {
                otherPlayer.isDead = false;
                otherPlayer.health = data.health;
                otherPlayer.x = data.x;
                otherPlayer.y = data.y;
                otherPlayer.targetX = data.targetX;
                otherPlayer.targetY = data.targetY;
            }
        }
    });
    
    socket.on('playerDeathBurst', (data) => {
        // Get player color - either from local gameState or otherPlayers
        let playerColor = '#ff0000'; // default
        if (data.id === myPlayerId) {
            playerColor = gameState.playerColor || playerColor;
        } else {
            const otherPlayer = otherPlayers.get(data.id);
            if (otherPlayer) {
                playerColor = otherPlayer.color || playerColor;
            }
        }
        triggerDeathBurst(data.x, data.y, data.id === myPlayerId, data.color || playerColor);
    });
}

export function getSocket() {
    return socket;
}

export function getIsConnected() {
    return isConnected;
}

export function getMyPlayerId() {
    return myPlayerId;
}

export function getNetworkState() {
    return {
        socket,
        isConnected,
        myPlayerId
    };
}

export function emitMove(action) {
    if (socket && isConnected) {
        socket.emit('move', action);
    }
}

export function emitDash(direction) {
    if (socket && isConnected) {
        socket.emit('dash', direction);
    }
}

export function emitMana() {
    if (socket && isConnected) {
        socket.emit('mana');
    }
}

export function emitUpdateHealth(health) {
    if (socket && isConnected) {
        socket.emit('updateHealth', health);
    }
}

