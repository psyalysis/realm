// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

// Game Configuration (must match client)
const WORLD_WIDTH = 50;
const WORLD_HEIGHT = 50;
const BASE_ANIMATION_SPEED = 2.5;
const DASH_DURATION = 0.3; // Duration of dash speed boost in seconds
const DASH_COOLDOWN = 2.0;
const MANA_COOLDOWN = 7.0;
const HIT_COOLDOWN = 0.4; // Cooldown between hits (seconds)
const MANA_CAST_TIME = 0.7;
const MAX_HEALTH = 3;
const RESPAWN_DELAY = 5.0; // Seconds before respawn

// Map generation (shared seed for consistency)
const FIXED_MAP_SEED = 12345; // Fixed seed for consistent map across all sessions

// Rate limiting
const MOVE_RATE_LIMIT = 70; // Minimum milliseconds between moves (10 moves/sec max)
const DASH_RATE_LIMIT = 300; // Minimum milliseconds between dashes

// State sync interval
const SYNC_INTERVAL = 250; // Milliseconds between state syncs (4Hz)

module.exports = {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    BASE_ANIMATION_SPEED,
    DASH_DURATION,
    DASH_COOLDOWN,
    MANA_COOLDOWN,
    HIT_COOLDOWN,
    MANA_CAST_TIME,
    MAX_HEALTH,
    RESPAWN_DELAY,
    FIXED_MAP_SEED,
    MOVE_RATE_LIMIT,
    DASH_RATE_LIMIT,
    SYNC_INTERVAL
};

