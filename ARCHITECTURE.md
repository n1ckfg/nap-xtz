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
- FA2 NFT minting to Shadownet
- Contract address: `KT1DypSEV87pwiw6swdYqhDKWRBZ7xfqeS3c`

**js/drawing/** - 3D hand-tracking drawing mode (ES modules, Three.js):
- `drawing.js` - Main entry, takes the hand tracker's results, camera controls, render loop
- `hands.js` - `HandTracker` runs the gesture recognizer off the main thread and queues its results; `HandInput` decides which hand in each result is which
- `hands-worker.js` - One MediaPipe `GestureRecognizer` in a module worker; `HandTracker` runs two
- `tools.js` - Stroke and Frame classes for managing drawn lines
- `controller.js` - A hand as a set of buttons and a position, driven by recognizer results: One Euro filtering of the fingertip, debounced signs, and the times strokes start and end
- `mouse.js` - Mouse controller that projects mouse input into 3D space
- `palette.js` - Color selection wheel
- `worldscale.js` - Two-handed scale/rotate gestures

### CSS

- `css/main.css` - Styles for index.html
- `css/drawing.css` - Styles for standalone drawing.html

## Key Patterns

### Drawing Mode Integration

Drawing mode exports `startDrawingMode(container)` and `stopDrawingMode()` for launching from index.html. The module uses `window._drawingContainer` to reference DOM elements within the active container. Leaving goes through `exitDrawingMode()` in index.html (also `window.exitDrawingMode`), whether by the Exit button or the double thumbs-up, so the p5 canvas's draw loop — stopped while the overlay covers it — always starts again.

### Hands, off the main thread

The recognizer is the most expensive thing drawing mode does, and it used to run synchronously in the render loop, which held drawing mode to the recognizer's rate — two or three frames a second on a slow machine. It now runs in workers (`hands-worker.js`), fed one camera frame at a time as an `ImageBitmap`, and the page renders at its own pace, taking results as they arrive. There are two recognizers, one looking for up to two hands and one for a single hand, which skips the palm detection the two-hand one runs on every frame and so samples a single drawing hand about twice as often. `HandTracker` gives the single-hand one the frames while one hand is in view, and the two-hand one the frames when there is no hand, two hands, or a hand making a sign with a two-handed meaning (a fist, a thumb or a V), with a look for a second hand once a second — but not mid-stroke. Both use MediaPipe's CPU delegate (its "GPU" delegate is WebGL, and shares the GPU with the scene), are warmed up on a blank frame, and are loaded once per page. Where a module worker can't be had, the recognizer runs on the main thread as before.

Every result carries the time its camera frame was taken, and everything downstream runs on that clock rather than on animation frames. `HandInput` matches each result's hands to controllers by where each controller's hand was last seen, merges the recognizer's occasional duplicate of one hand, and declares a hand gone after two results running without it. Each `Controller` smooths the fingertip with One Euro filters and debounces the recognizer's labels into signs. A stroke starts where its sign was first seen and ends where the sign that ended it was first seen; the line tool is sticky through "None" and ends on any other sign or when the hand goes. Points are placed on the camera ray through the fingertip, so a stroke lands on screen under the finger whatever the (noisy) depth. Held gestures are timed on what the camera saw, and a one-handed hold that fills while another hand is making the same sign, not yet confirmed, waits for it (up to 1.5 s): that is an exit or a clear in the making, not a recentre or an undo.

### Strokes

Completed strokes all live in one vertex-coloured mesh (`StrokeBatch` in `tools.js`): a stroke is appended once, when it ends, and undo pops it, so the whole drawing is one draw call. The strokes being drawn keep a mesh each, rebuilt at most once a frame (`Frame.flush()`). `Stroke.refine()` fits a centripetal Catmull-Rom spline through a finished stroke's samples, so sparse samples still draw round curves, and the brush's taper runs by distance along the stroke rather than by point count. `Stroke.toBrushOutline()`, which `convertToNAPLPS()` encodes, is built from the same edges as the mesh.

### Render scale

The renderer draws without MSAA at one device pixel per CSS pixel. When frames run long the render scale drops a step (to 0.5 at most) and the browser scales the canvas up; the step is kept only if frames actually got faster, and the scale climbs back when there is room. A machine that keeps up stays at 1.

---

## Grid Project (grid/)

GPU-accelerated cellular automaton that follows NAPLPS drawing paths.

### Files

**grid/index.html** - Entry point, includes NAPLPS libraries

**grid/js/**
- `main.js` - p5.js setup, shader pipeline, Target class, drag-and-drop
- `telidon.js` - Simplified NAPLPS parser extracting points and colors

**grid/shaders/**
- `passthrough.vert` - Vertex shader
- `simulation.frag` - State machine (idle/kaboom/clicked/respawn), stores NAPLPS color per cell
- `render.frag` - HSV-to-RGB conversion for colored dot rendering

**grid/css/main.css** - Fullscreen centered canvas

### How It Works

1. **NAPLPS Loading**: `NaplpsReader` parses NAPLPS via `NapDecoder`, extracts all points with their associated colors into `allPoints[]`

2. **Target Following**: The `Target` class calls `naplpsReader.getNextPoint()` to traverse NAPLPS points sequentially, converting normalized coords (0-1) to shader space (-sW/2 to sW/2)

3. **Color Storage**: When target clicks a cell, the simulation shader converts the current NAPLPS RGB to hue + sat/val and stores in the B and A channels

4. **Color Propagation**: When cells trigger neighbors (KABOOM state), they inherit the triggering neighbor's color values

5. **Rendering**: The render shader converts stored hue back to RGB via `hsv2rgb()` for colored output

### Usage

- Loads default NAPLPS file on startup (`../images/output_20260222_181752.nap`)
- Drag & drop any .nap file to load
- Press any key to reset grid and pick new propagation pattern

