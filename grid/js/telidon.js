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
        // Use the NapDecoder from naplps.js
        const decoder = new NapDecoder([napRaw]);

        for (const cmd of decoder.cmds) {
            // Handle color commands
            if (cmd.opcode.id === "SET COLOR" || cmd.opcode.id === "SELECT COLOR") {
                if (cmd.col) {
                    this.currentColor = {
                        r: cmd.col.x,
                        g: cmd.col.y,
                        b: cmd.col.z
                    };
                }
            }

            // Handle drawing commands with points
            if (cmd.points && cmd.points.length > 0) {
                const path = new NaplpsPath();
                path.color = { ...this.currentColor };

                // Check if it's a fill command
                const fillOps = ["POLY FILLED", "SET & POLY FILLED", "RECT FILLED",
                                 "SET & RECT FILLED", "ARC FILLED", "SET & ARC FILLED"];
                path.isFill = fillOps.includes(cmd.opcode.id);

                for (const pt of cmd.points) {
                    // Filter valid points (0-1 range)
                    if (pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1) {
                        path.points.push({ x: pt.x, y: pt.y });
                        this.allPoints.push({
                            x: pt.x,
                            y: pt.y,
                            color: { ...this.currentColor }
                        });
                    }
                }

                if (path.points.length > 0) {
                    this.paths.push(path);
                }
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
