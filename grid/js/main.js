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

// NAPLPS reader
let naplpsReader = null;
let currentNaplpsColor = { r: 255, g: 255, b: 255 };

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

// Default NAPLPS file to load
const defaultNaplpsFile = '../images/output_20260222_181752.nap';

function preload() {
    simulationShader = loadShader('shaders/passthrough.vert', 'shaders/simulation.frag');
    renderShader = loadShader('shaders/passthrough.vert', 'shaders/render.frag');

    // Load default NAPLPS file
    loadStrings(defaultNaplpsFile, function(response) {
        let reader = new FileReader();
        reader.onload = function(e) {
            naplpsReader = new NaplpsReader(e.target.result);
            console.log("NAPLPS loaded:", naplpsReader.allPoints.length, "points");
        };
        reader.readAsText(new Blob(response), 'UTF-8');
    });
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
    setupDragDrop();

    console.log("GridJoe GPU + NAPLPS - initialized");
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
    target.run(naplpsReader);
    if (target.armResetAll) {
        //resetAll();
        setupPattern(); // Only change pattern, keep animation
        target.armResetAll = false;
    }

    // Update current color from NAPLPS
    if (naplpsReader && naplpsReader.getCurrentPoint()) {
        currentNaplpsColor = naplpsReader.getCurrentPoint().color;
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
    // Pass NAPLPS color to simulation shader
    simulationShader.setUniform('u_napColor', [
        currentNaplpsColor.r / 255.0,
        currentNaplpsColor.g / 255.0,
        currentNaplpsColor.b / 255.0
    ]);
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

// Drag and drop NAPLPS files
function setupDragDrop() {
    let dropZone = document.body;

    dropZone.addEventListener('dragover', function(e) {
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    dropZone.addEventListener('drop', function(e) {
        e.stopPropagation();
        e.preventDefault();
        let file = e.dataTransfer.files[0];
        if (file) {
            let reader = new FileReader();
            reader.onload = function(e2) {
                loadNaplpsFromText(e2.target.result);
            };
            reader.readAsText(file, 'UTF-8');
        }
    });
}

function loadNaplpsFromText(napRaw) {
    naplpsReader = new NaplpsReader(napRaw);
    naplpsReader.reset();
    console.log("NAPLPS loaded:", naplpsReader.allPoints.length, "points");
    // Reset the grid when loading new file
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

// Target class - follows NAPLPS points when available
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
        this.pickTarget(null);
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
