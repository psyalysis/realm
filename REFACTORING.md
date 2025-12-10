# Code Refactoring Structure

This document describes the new modular structure for the codebase.

## Client-Side Modules (`client/`)

- **config.js** - All configuration constants (world size, speeds, cooldowns, etc.)
- **gameState.js** - Game state management and performance cache
- **map.js** - Map generation, wall checking, position validation
- **camera.js** - Camera system and hit effects
- **animation.js** - Animation loop, interpolation, easing functions
- **renderer.js** - Rendering system (map, players, UI)
- **input.js** - Keyboard input handling
- **player.js** - Other player management
- **abilities.js** - Dash, mana, health systems
- **network.js** - Socket.io client networking
- **utils.js** - Utility functions (coordinate conversion, etc.)

## Server-Side Modules (`server/`)

- **config.js** - Server configuration constants
- **map.js** - Map generation and utilities
- **gameState.js** - Server game state management
- **player.js** - Player creation, removal, spawn management
- **movement.js** - Movement processing
- **abilities.js** - Dash and mana processing
- **collision.js** - Collision detection and damage handling
- **sync.js** - State synchronization and delta compression

## Main Files

- **script.js** - Client entry point (imports and initializes modules)
- **server.js** - Server entry point (imports and initializes modules)

## Migration Notes

1. All modules use ES6 imports/exports
2. HTML needs `type="module"` on script tag
3. Server uses CommonJS (Node.js) - may need to convert or use .mjs extension
4. Shared constants are in config files (must match between client/server)

