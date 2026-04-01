"use strict";

// Target class - follows NAPLPS points when available, falls back to random movement
class Target {

    constructor() {
        this.speedMin = 0.02;
        this.speedMax = 0.08;
        this.speed = 0.05;
        this.clickOdds = 0.1;
        this.chooseOdds = 0.005;
        this.markTime = 0;
        this.timeInterval = 100;  // Faster for NAPLPS following

        this.posX = 0;
        this.posY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.minDist = 3;
        this.clicked = true;  // Always clicked when following NAPLPS
        this.armResetAll = false;
        this.useNaplps = true;  // Toggle for NAPLPS following mode
    }

    run(naplpsReader) {
        this.posX = lerp(this.posX, this.targetX, this.speed);
        this.posY = lerp(this.posY, this.targetY, this.speed);

        let shouldPickNew = millis() > this.markTime + this.timeInterval ||
            dist(this.posX, this.posY, this.targetX, this.targetY) < this.minDist;

        if (shouldPickNew) {
            this.pickTarget(naplpsReader);
        }
    }

    pickTarget(naplpsReader) {
        this.markTime = millis();

        // If NAPLPS reader is available and has points, follow them
        if (this.useNaplps && naplpsReader && naplpsReader.allPoints.length > 0) {
            let point = naplpsReader.getNextPoint();
            if (point) {
                // Convert normalized coords (0-1) to shader coords (-sW/2 to sW/2)
                this.targetX = (point.x - 0.5) * sW;
                this.targetY = (point.y - 0.5) * sH;
                this.speed = random(this.speedMin, this.speedMax);
                this.clicked = true;  // Always drawing when following NAPLPS

                // Check if we completed a loop - chance to change pattern
                if (naplpsReader.hasLooped()) {
                    let r = random(1);
                    if (r < this.chooseOdds * 10) {
                        this.armResetAll = true;
                    }
                }
                return;
            }
        }

        // Fallback to random movement if no NAPLPS
        this.targetX = lerp(this.posX, random(-sW/2, sW/2), 0.5);
        this.targetY = lerp(this.posY, random(-sH/2, sH/2), 0.5);
        this.speed = random(this.speedMin, this.speedMax);
        let r = random(1);
        if (r < this.clickOdds) this.clicked = !this.clicked;
        if (r < this.chooseOdds) this.armResetAll = true;
    }

}
