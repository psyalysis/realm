# Realm - Multiplayer Tile-Based Grid Game

A multiplayer tile-based grid game with smooth animations, dash abilities, and mana/healing mechanics.

## Features

- **Multiplayer Support**: Real-time multiplayer using Socket.io
- **Smooth Animations**: Interpolated movement with squash/stretch and jelly wobble effects
- **Abilities**: 
  - Dash (I key) - Quick movement with cooldown
  - Mana/Heal (L key) - Restore health with cast time
- **Procedural Map Generation**: Shared seed ensures all players see the same map
- **Client-Side Prediction**: Optimistic updates for responsive gameplay

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

Open multiple browser windows/tabs to test multiplayer!

## Controls

- **W/A/S/D**: Move player
- **I**: Dash ability
- **L**: Mana/Heal ability
- **U**: Debug - Lose health (for testing)

## Architecture

### Server (`server.js`)
- Authoritative game server using Socket.io
- Validates all player actions
- Synchronizes game state to all clients
- Manages player connections/disconnections

### Client (`script.js`)
- Connects to server via Socket.io
- Client-side prediction for responsive controls
- Interpolates other players for smooth rendering
- Falls back to single-player mode if server unavailable

## Multiplayer Implementation Details

### Network Protocol
- **Client → Server**: 
  - `move(action)` - Player movement
  - `dash(direction)` - Dash ability
  - `mana()` - Mana/heal ability
  - `updateHealth(health)` - Debug health update

- **Server → Client**:
  - `gameState` - Initial game state on connection
  - `gameStateUpdate` - Periodic state sync
  - `playerJoined` - New player connected
  - `playerLeft` - Player disconnected
  - `playerMoved` - Other player moved
  - `playerDashed` - Other player dashed
  - `playerMana` - Other player used mana
  - `moveConfirmed` - Movement confirmed by server
  - `dashConfirmed` - Dash confirmed by server
  - `manaConfirmed` - Mana confirmed by server

### State Synchronization
- Server sends state updates every 100ms
- Client interpolates between updates for smooth rendering
- Server validates all actions to prevent cheating

## Development

The game supports both single-player and multiplayer modes:
- If server is available, runs in multiplayer mode
- If server is unavailable, falls back to single-player mode

## License

ISC

