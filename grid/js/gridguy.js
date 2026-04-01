"use strict";

class GridGuy {
    
    constructor(x, y, w, h, s, cc, dc, lc, rc) {    // float, float, float, float, string, float, int, int, int     
        this.rulesArray = [ "NWcorner", "NEcorner", "SWcorner", "SEcorner", "Nrow", "Srow", "Wrow", "Erow" ];  // string[] 
        this.switchArray = [ false, false, false, false, false, false, false, false ];  // bool[]  
        this.fillColorArray = [ color(255, 0, 0), color(0, 255, 0), color(0, 0, 255), color(255, 0, 255), color(50), color(60), color(70), color(80) ];  // color[]          
        

        this.birthTime = millis();  // int
        this.alpha = 255;  // int
        
        this.fillColorOrig = color(0);
        this.fillColor = this.fillColorOrig; // int
        this.strokeColor;
        this.hoveredColor = color(0);
        this.clickedColor = color(random(127, 255)); //21,87));

        this.debugColors = false;
        this.strokeLines = false;
        this.hovered = false;
        this.clicked = false;
        this.kaboom = false;

        this.posX = x - width/2;  // float
        this.posY = y - height/2;  // float
        this.guyWidth = w;  // float
        this.guyHeight = h;  // float
        this.chaos = abs(1.0 - cc);  // float

        this.applyRule = s;  // string

        this.delayCountDownOrig = int(random(dc * this.chaos, dc));  // int
        this.delayCountDown = this.delayCountDownOrig;  // int
        this.lifeCountDownOrig = int(random(lc * this.chaos, lc));  // int
        this.lifeCountDown = this.lifeCountDownOrig;  // int
        this.respawnCountDownOrig = int(random(rc * this.chaos, rc));  // int
        this.respawnCountDown = this.respawnCountDownOrig;  // int
        
        for (let i = 0; i < this.rulesArray.length; i++) {
            if (this.applyRule == this.rulesArray[i]) {
                this.switchArray[i] = true;
            }
        }

        //strokeLines = true;
    }

    run() {
        this.update();
        this.draw();
    }

    update() {
        if (dist(target.posX, target.posY, this.posX, this.posY) < this.guyWidth) {
            this.hovered = true;
            this.birthTime = millis();
            this.alpha = 255;
        } else {
            this.hovered = false;
        }

        if (this.hovered && target.clicked) this.mainFire();

        if (this.kaboom) {
            this.alpha = 255;
            this.birthTime = millis();
        
            if (this.delayCountDown>0) {
                this.delayCountDown--;
            } else {
                this.kaboom = false;
                this.clicked = true;
                this.delayCountDown = this.delayCountDownOrig;
            }
        }

        if (this.clicked) {
            if (this.lifeCountDown > 0) {
                this.lifeCountDown--;
            } else {
                this.clicked = false;
            }
        }

        if (this.lifeCountDown == 0 && this.respawnCountDown > 0) {
            this.respawnCountDown--;
        } 
        else if (this.respawnCountDown == 0) {
            this.lifeCountDown = this.lifeCountDownOrig;
            this.respawnCountDown = this.respawnCountDownOrig;
        }
    }

    mainFire() {
        this.clicked = true;
        this.kaboom = false;
        this.delayCountDown = this.delayCountDownOrig;
        this.lifeCountDown = this.lifeCountDownOrig;
        this.respawnCountDown = this.respawnCountDownOrig;
    }

    draw() {
        this.fillColor = this.fillColorOrig;
        noStroke();

        if (this.hovered && !this.clicked) {
            this.fillColor = this.hoveredColor;
        } else if (this.clicked) {
            this.fillColor = this.clickedColor;
        }

        if (this.fillColor !== this.fillColorOrig) {
            this.alpha -= ((millis() - this.birthTime)/2);
            this.drawRect();
        }
    }

    drawRect() {
        fill(this.fillColor, this.alpha);
        rectMode(CENTER);
        rect(this.posX, this.posY, this.guyWidth, this.guyHeight);
    }
    
    drawPoint() {
        stroke(this.fillColor, this.alpha);
        strokeWeight(this.guyWidth);
        point(this.posX, this.posY);
    }

    drawEllipse() {
        fill(this.fillColor, this.alpha);
        ellipseMode(CENTER);
        ellipse(this.posX, this.posY, this.guyWidth, this.guyHeight);
    }

}
