// ============================================================================
// SERVER MAP GENERATION
// ============================================================================

const {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    FIXED_MAP_SEED
} = require('./config.js');

let map = [];
let mapSeed = FIXED_MAP_SEED;

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
    
    // Assign to module-level map
    map = newMap;
    return map;
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
    // Safety check: ensure map is initialized
    if (!map || !map[y] || map[y][x] === undefined) {
        return true; // Treat uninitialized as wall for safety
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

function getMap() {
    return map;
}

function setMap(newMap) {
    map = newMap;
}

function getMapSeed() {
    return mapSeed;
}

function setMapSeed(seed) {
    mapSeed = seed;
}

module.exports = {
    generateMap,
    isWall,
    findNearestValidPosition,
    getMap,
    setMap,
    getMapSeed,
    setMapSeed
};

