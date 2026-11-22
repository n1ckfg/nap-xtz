"use strict";

// Simplified NAPLPS parser for GridJoe2 - extracts points and colors for target following

class NaplpsPath {
    constructor() {
        this.points = [];      // Array of {x, y} normalized 0-1
        this.color = { r: 255, g: 255, b: 255 };
        this.isFill = false;
    }
}

class NaplpsReader {
    constructor(napRaw) {
        this.paths = [];
        this.allPoints = [];   // Flattened list of all points with colors
        this.currentIndex = 0;
        this.currentColor = { r: 255, g: 255, b: 255 };

        if (napRaw) {
            this.parse(napRaw);
        }
    }

    parse(napRaw) {
        // Use NAPLPS.decode from naplps.js
        const decoded = NAPLPS.decode(napRaw);
        let palette = NAPLPS.buildDefaultPalette(16);
        let colorMode = 0;
        let fgIndex = 0;
        let direct = { r: 1, g: 1, b: 1 };

        const updateColor = () => {
            const c = colorMode === 0 ? direct : (palette[fgIndex] || { r: 1, g: 1, b: 1 });
            this.currentColor = {
                r: Math.max(0, Math.min(255, Math.round(c.r * 255))),
                g: Math.max(0, Math.min(255, Math.round(c.g * 255))),
                b: Math.max(0, Math.min(255, Math.round(c.b * 255)))
            };
        };

        const addPath = (rawPoints, isFill) => {
            const path = new NaplpsPath();
            path.color = { ...this.currentColor };
            path.isFill = isFill;

            for (const pt of rawPoints) {
                // NAPLPS unit screen is x in [0, 1], y in [0, 0.75] (Y-up).
                // Convert to Y-down centered in [0.125, 0.875] so Target's
                // (point.y - 0.5) * sW maps to [-sH/2, +sH/2].
                const gx = pt.x;
                const gy = 0.875 - pt.y;
                if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1) {
                    path.points.push({ x: gx, y: gy });
                    this.allPoints.push({
                        x: gx,
                        y: gy,
                        color: { ...this.currentColor }
                    });
                }
            }

            if (path.points.length > 0) {
                this.paths.push(path);
            }
        };

        for (const cmd of decoded.commands) {
            switch (cmd.type) {
                case "palette":
                    palette = cmd.colors.map(c => ({ r: c.r, g: c.g, b: c.b }));
                    updateColor();
                    break;
                case "setPalette":
                    palette[cmd.index] = { r: cmd.r, g: cmd.g, b: cmd.b };
                    updateColor();
                    break;
                case "setColor":
                    if (!cmd.transparent) {
                        direct = { r: cmd.r, g: cmd.g, b: cmd.b };
                        updateColor();
                    }
                    break;
                case "selectColor":
                    if (cmd.mode !== undefined) colorMode = cmd.mode;
                    if (cmd.index !== undefined) fgIndex = cmd.index;
                    updateColor();
                    break;
                case "polygon":
                case "arc":
                    if (cmd.points && cmd.points.length > 0) {
                        addPath(cmd.points, !!cmd.filled);
                    }
                    break;
                case "rect":
                    addPath([
                        { x: cmd.x, y: cmd.y },
                        { x: cmd.x + cmd.w, y: cmd.y },
                        { x: cmd.x + cmd.w, y: cmd.y + cmd.h },
                        { x: cmd.x, y: cmd.y + cmd.h }
                    ], !!cmd.filled);
                    break;
                case "line":
                    addPath([
                        { x: cmd.x1, y: cmd.y1 },
                        { x: cmd.x2, y: cmd.y2 }
                    ], false);
                    break;
                case "incLine":
                    if (cmd.segments && cmd.segments.length > 0) {
                        const pts = [{ x: cmd.segments[0].x1, y: cmd.segments[0].y1 }];
                        for (const s of cmd.segments) {
                            pts.push({ x: s.x2, y: s.y2 });
                        }
                        addPath(pts, false);
                    }
                    break;
                case "point":
                    if (cmd.draw) {
                        addPath([{ x: cmd.x, y: cmd.y }], false);
                    }
                    break;
            }
        }
    }

    // Get the next point for target following
    getNextPoint() {
        if (this.allPoints.length === 0) return null;

        const point = this.allPoints[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.allPoints.length;
        return point;
    }

    // Get current point without advancing
    getCurrentPoint() {
        if (this.allPoints.length === 0) return null;
        return this.allPoints[this.currentIndex];
    }

    // Check if we've completed one loop
    hasLooped() {
        return this.currentIndex === 0 && this.allPoints.length > 0;
    }

    // Reset to beginning
    reset() {
        this.currentIndex = 0;
    }

    // Get progress (0-1)
    getProgress() {
        if (this.allPoints.length === 0) return 0;
        return this.currentIndex / this.allPoints.length;
    }
}

// Global instance for easy access
window.NaplpsReader = NaplpsReader;
