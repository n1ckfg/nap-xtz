## NAP-XTZ Architecture

### Core Components

**index.html** - Main application entry point containing:
- p5.js canvas for NAPLPS rendering
- Drag-and-drop file loading
- SVG-to-NAPLPS conversion
- Tezos wallet connection and minting UI
- "Live Drawing" button to launch 3D drawing mode

**drawing.html** - Standalone 3D drawing mode (can also be launched from index.html)

### JavaScript Modules

**js/telidon/**
- `naplps.js` - NAPLPS format encoder/decoder (no p5.js dependency)
- `TelidonP5.js` - p5.js renderer for decoded NAPLPS data
- `build/` - Split build files for modular loading

**js/tezos/tezos.js** - Tezos blockchain integration:
- Beacon SDK wallet connection
- FA2 NFT minting to Ghostnet
- Contract address: `KT1NjXnehzE7RRREsZ3UuWorJY75anjeWnjJ`

**js/drawing/** - 3D hand-tracking drawing mode (ES modules, Three.js):
- `drawing.js` - Main entry, MediaPipe gesture recognition, camera controls
- `tools.js` - Stroke and Frame classes for managing drawn lines
- `controller.js` - Hand controller wrapper with Kalman filtering
- `palette.js` - Color selection wheel
- `worldscale.js` - Two-handed scale/rotate gestures

### CSS

- `css/main.css` - Styles for index.html
- `css/drawing.css` - Styles for standalone drawing.html

## Key Patterns

### Drawing Mode Integration

Drawing mode exports `startDrawingMode(container)` and `stopDrawingMode()` for launching from index.html. The module uses `window._drawingContainer` to reference DOM elements within the active container.

