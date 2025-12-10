// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

// World Configuration
export const WORLD_WIDTH = 50;  // Grid tiles wide
export const WORLD_HEIGHT = 50; // Grid tiles tall

// Input Mapping
export const INPUT_MAP = {
    'w': 'MOVE_UP',
    's': 'MOVE_DOWN',
    'a': 'MOVE_LEFT',
    'd': 'MOVE_RIGHT'
};

// Animation Configuration
export const BASE_ANIMATION_SPEED = 2; // Tiles per second
export const CAMERA_ARRIVAL_TIME = 1; // Camera should arrive at target within this time (seconds)
export const TRANSITION_THRESHOLD = 0.025; // Start next move at 85% completion (0.15 of 1.0 tile remaining)

// Dash Configuration
export const DASH_DURATION = 0.5; // Duration of dash speed boost in seconds
export const DASH_COOLDOWN = 2.0; // Cooldown in seconds
export const DASH_SPEED = 8; // Tiles per second (4x BASE_ANIMATION_SPEED)

// Mana Configuration
export const MANA_COOLDOWN = 7.0; // Cooldown in seconds
export const MANA_CAST_TIME = 0.7; // Time player is stopped while casting (seconds)

// Health Configuration
export const MAX_HEALTH = 3; // Maximum health points

// Grid Configuration
export const GRID_OPACITY = 0.1; // Grid line opacity (0.0 to 1.0)
export const GRID_THICKNESS = 1.25; // Grid line thickness in pixels
export const WALL_CORNER_RADIUS = 8; // Wall corner radius in pixels
export const BACKGROUND_COLOR = '#ffffff'; // Background color (white)
export const PLAYER_GLOW_RADIUS = 3; // Player glow radius in cells

// Map Generation Configuration
export const MAP_CENTER_X = WORLD_WIDTH / 2;
export const MAP_CENTER_Y = WORLD_HEIGHT / 2;
export const MAX_DISTANCE_FROM_CENTER = Math.sqrt(MAP_CENTER_X * MAP_CENTER_X + MAP_CENTER_Y * MAP_CENTER_Y);
export const WALL_CLUMP_BASE_PROBABILITY = 0.02; // Base probability of starting a wall clump
export const WALL_CLUMP_MAX_PROBABILITY = 0.15; // Maximum probability at edge
export const WALL_CLUMP_SIZE_MIN = 3; // Minimum clump size
export const WALL_CLUMP_SIZE_MAX = 8; // Maximum clump size
export const WALL_CLUMP_SPREAD_CHANCE = 0.4; // Chance for clump to spread to adjacent cell

// Player Configuration
export const PLAYER_SIZE = 0.85; // Player size relative to cell (1.0 = full cell size)
export const SQUASH_STRETCH_INTENSITY = 0.7; // Intensity of squash and stretch animation (0.0 to 1.0)
export const JELLY_WOBBLE_INTENSITY = 0.07; // Intensity of jelly wobble when arriving at destination (0.0 to 1.0)
export const JELLY_WOBBLE_FREQUENCY = 3.5; // Frequency of jelly wobble oscillation (cycles per second)
export const JELLY_WOBBLE_DURATION = 0.4; // Duration of wobble effect in seconds

// Client-side rate limiting
export const CLIENT_MOVE_RATE_LIMIT = 100; // Minimum milliseconds between moves (10 moves/sec max)
export const CLIENT_DASH_RATE_LIMIT = 300; // Minimum milliseconds between dashes

