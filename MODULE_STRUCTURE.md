# Module Structure Guide

## Overview

The codebase has been split into maintainable modules. Here's the structure:

## Client Modules (`client/`)

### Created:
- ✅ `config.js` - All configuration constants
- ✅ `gameState.js` - Game state management
- ✅ `map.js` - Map generation and utilities  
- ✅ `camera.js` - Camera system

### Still to Extract:
- `animation.js` - Animation loop (lines 1200-1455 in script.js)
- `renderer.js` - Rendering system (lines 2011-2526 in script.js)
- `input.js` - Input handling (lines 2532-2682 in script.js)
- `player.js` - Other player management (lines 558-730 in script.js)
- `abilities.js` - Dash/mana/health (lines 1457-1612, 1707-1890 in script.js)
- `network.js` - Socket.io client (lines 119-467 in script.js)
- `utils.js` - Coordinate conversion (lines 1032-1055 in script.js)

## Server Modules (`server/`)

### Created:
- ✅ `config.js` - Server configuration
- ✅ `map.js` - Map generation
- ✅ `gameState.js` - Server game state
- ✅ `player.js` - Player management

### Still to Extract:
- `movement.js` - Movement processing (lines 412-512 in server.js)
- `abilities.js` - Dash/mana processing (lines 514-732 in server.js)
- `collision.js` - Collision/damage (integrated in movement.js)
- `sync.js` - State synchronization (lines 734-835, 1148-1211 in server.js)

## Integration Steps

### For Client (script.js):

1. Update `index.html`:
```html
<script type="module" src="script.js"></script>
```

2. At top of `script.js`, add imports:
```javascript
import * as Config from './client/config.js';
import { gameState, performanceCache } from './client/gameState.js';
import * as MapUtils from './client/map.js';
import * as Camera from './client/camera.js';
// ... etc
```

3. Replace constants with `Config.*`
4. Replace function calls with module imports

### For Server (server.js):

Option A: Use ES Modules (add to package.json):
```json
{
  "type": "module"
}
```

Option B: Use CommonJS (convert server modules):
- Change `export` to `module.exports`
- Change `import` to `require`

## Benefits

1. **Maintainability** - Each module has a single responsibility
2. **Testability** - Modules can be tested independently
3. **Reusability** - Shared utilities can be imported where needed
4. **Readability** - Smaller files are easier to understand
5. **Collaboration** - Multiple developers can work on different modules

## Next Steps

1. Complete extraction of remaining modules
2. Update main files to use imports
3. Test to ensure functionality is preserved
4. Consider adding TypeScript for better type safety

