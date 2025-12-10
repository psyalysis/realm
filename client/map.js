// ============================================================================
// MAP GENERATION AND UTILITIES
// ============================================================================

import {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    MAP_CENTER_X,
    MAP_CENTER_Y,
    MAX_DISTANCE_FROM_CENTER,
    WALL_CLUMP_BASE_PROBABILITY,
    WALL_CLUMP_MAX_PROBABILITY,
    WALL_CLUMP_SIZE_MIN,
    WALL_CLUMP_SIZE_MAX,
    WALL_CLUMP_SPREAD_CHANCE
} from './config.js';

// Map Data Structure - 2D array to store wall positions (true = wall, false = empty)
let map = [];

// Generate map from seed (for multiplayer consistency)
export function generateMapFromSeed(seed) {
    // Simple seeded random function
    let seedValue = seed;
    function seededRandom() {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
    }
    
    // Initialize map
    map = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            map[y][x] = false;
        }
    }
    
    // Generate wall clumps using seeded random
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            const dx = x - MAP_CENTER_X;
            const dy = y - MAP_CENTER_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDistance = Math.min(distance / MAX_DISTANCE_FROM_CENTER, 1.0);
            const probability = WALL_CLUMP_BASE_PROBABILITY + 
                               (WALL_CLUMP_MAX_PROBABILITY - WALL_CLUMP_BASE_PROBABILITY) * normalizedDistance;
            
            if (seededRandom() < probability && !map[y][x]) {
                generateWallClumpSeeded(x, y, seededRandom);
            }
        }
    }
    
    // Ensure center is clear
    const playerX = Math.floor(WORLD_WIDTH / 2);
    const playerY = Math.floor(WORLD_HEIGHT / 2);
    map[playerY][playerX] = false;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = playerX + dx;
            const ny = playerY + dy;
            if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
                map[ny][nx] = false;
            }
        }
    }
}

function generateWallClumpSeeded(startX, startY, randomFn) {
    const clumpSize = Math.floor(randomFn() * (WALL_CLUMP_SIZE_MAX - WALL_CLUMP_SIZE_MIN + 1)) + WALL_CLUMP_SIZE_MIN;
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
                randomFn() < WALL_CLUMP_SPREAD_CHANCE) {
                queue.push({ x: nx, y: ny });
            }
        }
    }
}

export function generateMap() {
    // Initialize map with all empty cells
    map = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            map[y][x] = false;
        }
    }
    
    // Generate wall clumps
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            // Calculate distance from center
            const dx = x - MAP_CENTER_X;
            const dy = y - MAP_CENTER_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate probability based on distance (normalized to 0-1)
            const normalizedDistance = Math.min(distance / MAX_DISTANCE_FROM_CENTER, 1.0);
            const probability = WALL_CLUMP_BASE_PROBABILITY + 
                               (WALL_CLUMP_MAX_PROBABILITY - WALL_CLUMP_BASE_PROBABILITY) * normalizedDistance;
            
            // Check if we should start a clump here
            if (Math.random() < probability && !map[y][x]) {
                generateWallClump(x, y);
            }
        }
    }
    
    // Ensure player starting position is clear
    const playerX = Math.floor(WORLD_WIDTH / 2);
    const playerY = Math.floor(WORLD_HEIGHT / 2);
    map[playerY][playerX] = false;
    // Also clear immediate surrounding area for player
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = playerX + dx;
            const ny = playerY + dy;
            if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
                map[ny][nx] = false;
            }
        }
    }
}

function generateWallClump(startX, startY) {
    const clumpSize = Math.floor(Math.random() * (WALL_CLUMP_SIZE_MAX - WALL_CLUMP_SIZE_MIN + 1)) + WALL_CLUMP_SIZE_MIN;
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    
    let cellsPlaced = 0;
    
    while (queue.length > 0 && cellsPlaced < clumpSize) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;
        
        // Skip if already visited or out of bounds
        if (visited.has(key)) continue;
        if (current.x < 0 || current.x >= WORLD_WIDTH || current.y < 0 || current.y >= WORLD_HEIGHT) continue;
        
        visited.add(key);
        map[current.y][current.x] = true;
        cellsPlaced++;
        
        // Try to spread to adjacent cells
        const directions = [
            { x: 0, y: -1 }, // Up
            { x: 0, y: 1 },  // Down
            { x: -1, y: 0 }, // Left
            { x: 1, y: 0 }   // Right
        ];
        
        for (const dir of directions) {
            const nx = current.x + dir.x;
            const ny = current.y + dir.y;
            const nextKey = `${nx},${ny}`;
            
            if (!visited.has(nextKey) && 
                nx >= 0 && nx < WORLD_WIDTH && 
                ny >= 0 && ny < WORLD_HEIGHT &&
                Math.random() < WALL_CLUMP_SPREAD_CHANCE) {
                queue.push({ x: nx, y: ny });
            }
        }
    }
}

export function isWall(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
        return true; // Out of bounds counts as wall
    }
    return map[y][x] === true;
}

// Check if a fractional position (for interpolation) would be in a wall
// Uses the grid cell the position is in
export function isPositionInWall(x, y) {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    return isWall(gridX, gridY);
}

// Find nearest valid (non-wall) position
export function findNearestValidPosition(startX, startY) {
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

// Clamp interpolated position to ensure it never goes into a wall
export function clampInterpolatedPosition(interpolatedX, interpolatedY, targetX, targetY, currentX, currentY) {
    // Check if interpolated position is in a wall
    if (isPositionInWall(interpolatedX, interpolatedY)) {
        // If target is valid, snap to current position (don't move into wall)
        if (!isWall(targetX, targetY)) {
            // Target is valid, but we're interpolating through a wall
            // Clamp to current position to prevent wall penetration
            return { x: currentX, y: currentY };
        } else {
            // Target is also invalid, stay at current position
            return { x: currentX, y: currentY };
        }
    }
    
    // Position is valid, return as-is
    return { x: interpolatedX, y: interpolatedY };
}

// Get map data (for rendering)
export function getMap() {
    return map;
}

// Initialize empty map
export function initEmptyMap() {
    map = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        map[y] = [];
        for (let x = 0; x < WORLD_WIDTH; x++) {
            map[y][x] = false;
        }
    }
}

