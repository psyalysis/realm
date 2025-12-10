// ============================================================================
// SERVER GAME STATE
// ============================================================================

// Game state - stores all players (shared across all connections)
const gameState = {
    players: new Map(), // playerId -> player data
    map: null
};

// Track if game has been initialized
let gameInitialized = false;

function isGameInitialized() {
    return gameInitialized;
}

function setGameInitialized(value) {
    gameInitialized = value;
}

module.exports = {
    gameState,
    isGameInitialized,
    setGameInitialized
};

