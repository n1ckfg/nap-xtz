"use strict";

// ---     MAIN CONTROLS     ---
let delayCounter = 0; //0;
let lifeCounter = 40; //20;
let respawnCounter = 50; //50;
let globalChaos = 0.03; //0.3;
// -------------------------
let choose = 0;
let maxChoices = 7;
let sW = 640;
let sH = 480;
let fps = 60;
let scaleFactor = 1;

// Shader resources
let simulationShader;
let renderShader;

// p5.js Framebuffers for ping-pong
let fboA, fboB;
let currentBuffer = 0;
let renderBuffer;

// Target (autonomous cursor)
let target;

// Propagation odds: NW, N, NE, W, E, SW, S, SE
let odds = [0, 0.5, 0, 0.5, 0.5, 0, 0.5, 0];

// Pattern presets
const patterns = [
    { odds: [0, 0.5, 0, 0.5, 0.5, 0, 0.5, 0], randomize: [] },
    { odds: [null, 1, 1, null, 0, 1, 0, null], randomize: [0, 3, 7] },
    { odds: [0, 0, null, null, null, null, 0, 0], randomize: [2, 3, 4, 5], scale: [1, 1, 0.1, 1, 1, 0.1, 1, 1] },
    { odds: [0, 0.1, 0, 0, 0, null, 0.5, null], randomize: [5, 7] },
    { odds: [0, 0, 0, 0, 0, null, 1, null], randomize: [5, 7], scale: [1, 1, 1, 1, 1, 0.1, 1, 0.1] },
    { odds: [null, 1, null, 0, 0, 0, 0, 0], randomize: [0, 2], scale: [0.1, 1, 0.1, 1, 1, 1, 1, 1] },
    { odds: [null, null, null, null, null, null, null, null], randomize: [0,1,2,3,4,5,6,7] }
];

function preload() {
    simulationShader = loadShader('shaders/passthrough.vert', 'shaders/simulation.frag');
    renderShader = loadShader('shaders/passthrough.vert', 'shaders/render.frag');
}

function setup() {
    scaleFactor = windowHeight / sH;
    let canvasW = sW * scaleFactor;
    let canvasH = sH * scaleFactor;
    createCanvas(canvasW, canvasH);
    pixelDensity(1);
    noCursor();
    frameRate(fps);
    noStroke();
    noSmooth();

    // Create WEBGL graphics buffer for rendering
    renderBuffer = createGraphics(sW, sH, WEBGL);
    renderBuffer.pixelDensity(1);
    renderBuffer.noStroke();

    // Create framebuffers using p5.js API (available in p5.js 1.7+)
    let fboSettings = {
        width: sW,
        height: sH,
        density: 1,
        textureFiltering: NEAREST,
        antialias: false,
        depth: false
    };
    fboA = renderBuffer.createFramebuffer(fboSettings);
    fboB = renderBuffer.createFramebuffer(fboSettings);

    // Clear both
    fboA.begin();
    renderBuffer.clear();
    fboA.end();
    fboB.begin();
    renderBuffer.clear();
    fboB.end();

    target = new Target();
    setupPattern();

    console.log("GridJoe GPU - p5.js Framebuffer ping-pong initialized");
}

function setupPattern() {
    choose = int(random(maxChoices));
    console.log("Pattern:", choose);

    let pattern = patterns[choose];
    for (let i = 0; i < 8; i++) {
        if (pattern.odds[i] === null || pattern.randomize.includes(i)) {
            let val = random(1);
            if (pattern.scale && pattern.scale[i]) {
                val *= pattern.scale[i];
            }
            odds[i] = val;
        } else {
            odds[i] = pattern.odds[i];
        }
    }
}

function draw() {
    target.run();
    if (target.armResetAll) {
        //resetAll();
        setupPattern(); // Only change pattern, keep animation
        target.armResetAll = false;
    }

    let readFBO = currentBuffer === 0 ? fboA : fboB;
    let writeFBO = currentBuffer === 0 ? fboB : fboA;

    // --- SIMULATION PASS: render to framebuffer ---
    writeFBO.begin();
    renderBuffer.clear();
    renderBuffer.shader(simulationShader);
    simulationShader.setUniform('u_state', readFBO.color);
    simulationShader.setUniform('u_resolution', [sW, sH]);
    simulationShader.setUniform('u_target', [target.posX, -target.posY]);
    simulationShader.setUniform('u_targetClicked', target.clicked ? 1.0 : 0.0);
    simulationShader.setUniform('u_time', millis() / 1000.0);
    simulationShader.setUniform('u_deltaTime', deltaTime / 1000.0);
    simulationShader.setUniform('u_oddsNW', odds[0]);
    simulationShader.setUniform('u_oddsN', odds[1]);
    simulationShader.setUniform('u_oddsNE', odds[2]);
    simulationShader.setUniform('u_oddsW', odds[3]);
    simulationShader.setUniform('u_oddsE', odds[4]);
    simulationShader.setUniform('u_oddsSW', odds[5]);
    simulationShader.setUniform('u_oddsS', odds[6]);
    simulationShader.setUniform('u_oddsSE', odds[7]);
    simulationShader.setUniform('u_delayFrames', delayCounter);
    simulationShader.setUniform('u_lifeFrames', lifeCounter);
    simulationShader.setUniform('u_respawnFrames', respawnCounter);
    simulationShader.setUniform('u_chaos', globalChaos);
    renderBuffer.rect(-sW/2, -sH/2, sW, sH);
    writeFBO.end();

    // Swap buffers
    currentBuffer = 1 - currentBuffer;

    // --- RENDER PASS: render to graphics buffer ---
    renderBuffer.clear();
    renderBuffer.shader(renderShader);
    renderShader.setUniform('u_state', writeFBO.color);
    renderShader.setUniform('u_resolution', [sW, sH]);
    renderShader.setUniform('u_time', millis() / 1000.0);
    renderBuffer.rect(-sW/2, -sH/2, sW, sH);
    renderBuffer.resetShader();

    // --- Draw scaled to main canvas ---
    clear();
    image(renderBuffer, 0, 0, width, height);
}

function keyPressed() {
    resetAll();
}

function resetAll() {
    fboA.begin();
    renderBuffer.clear();
    fboA.end();
    fboB.begin();
    renderBuffer.clear();
    fboB.end();
    setupPattern();
}

function windowResized() {
    scaleFactor = windowHeight / sH;
    let canvasW = sW * scaleFactor;
    let canvasH = sH * scaleFactor;
    resizeCanvas(canvasW, canvasH);
}

// Target class
class Target {
    constructor() {
        this.speedMin = 0.01;
        this.speedMax = 0.05;
        this.speed = 0.03;
        this.clickOdds = 0.1;
        this.chooseOdds = 0.01;
        this.markTime = 0;
        this.timeInterval = 200;
        this.posX = 0;
        this.posY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.minDist = 5;
        this.clicked = false;
        this.armResetAll = false;
        this.pickTarget();
    }

    run() {
        this.posX = lerp(this.posX, this.targetX, this.speed);
        this.posY = lerp(this.posY, this.targetY, this.speed);
        if (millis() > this.markTime + this.timeInterval ||
            dist(this.posX, this.posY, this.targetX, this.targetY) < this.minDist) {
            this.pickTarget();
        }
    }

    pickTarget() {
        this.markTime = millis();
        this.targetX = lerp(this.posX, random(-sW/2, sW/2), 0.5);
        this.targetY = lerp(this.posY, random(-sH/2, sH/2), 0.5);
        this.speed = random(this.speedMin, this.speedMax);
        let r = random(1);
        if (r < this.clickOdds) this.clicked = !this.clicked;
        if (r < this.chooseOdds) this.armResetAll = true;
    }
}
