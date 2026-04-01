#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform vec2 u_target;
uniform float u_targetClicked;
uniform float u_time;
uniform float u_deltaTime;

uniform float u_oddsNW;
uniform float u_oddsN;
uniform float u_oddsNE;
uniform float u_oddsW;
uniform float u_oddsE;
uniform float u_oddsSW;
uniform float u_oddsS;
uniform float u_oddsSE;

uniform float u_delayFrames;
uniform float u_lifeFrames;
uniform float u_respawnFrames;
uniform float u_chaos;
uniform vec3 u_napColor;  // NAPLPS color (RGB 0-1)

// State encoding (8-bit safe):
// R: state (0=idle, 0.25=kaboom, 0.5=clicked, 0.75=respawn)
// G: countdown (1.0 to 0.0)
// B: NAPLPS color hue (0-1)
// A: NAPLPS color saturation/brightness

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Convert RGB to hue (0-1)
float rgbToHue(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float delta = maxC - minC;

    if (delta < 0.001) return 0.0;

    float hue = 0.0;
    if (maxC == c.r) {
        hue = mod((c.g - c.b) / delta, 6.0);
    } else if (maxC == c.g) {
        hue = (c.b - c.r) / delta + 2.0;
    } else {
        hue = (c.r - c.g) / delta + 4.0;
    }
    return hue / 6.0;
}

// Get saturation
float rgbToSat(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    if (maxC < 0.001) return 0.0;
    return (maxC - minC) / maxC;
}

// Get value/brightness
float rgbToVal(vec3 c) {
    return max(max(c.r, c.g), c.b);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 texel = 1.0 / u_resolution;

    vec4 current = texture2D(u_state, uv);
    float state = current.r;
    float countdown = current.g;
    float colorHue = current.b;     // NAPLPS hue
    float colorSatVal = current.a;  // Combined sat/val

    // Initialize color if needed (for non-NAPLPS mode)
    if (colorSatVal < 0.01) {
        colorHue = hash(gl_FragCoord.xy);
        colorSatVal = 0.5 + 0.5 * hash(gl_FragCoord.xy + vec2(0.5, 0.5));
    }

    float randVal = hash(gl_FragCoord.xy + vec2(fract(u_time * 7.3), fract(u_time * 11.1)));

    // Target hover check
    vec2 targetUV = (u_target + u_resolution * 0.5) / u_resolution;
    float targetDist = distance(uv, targetUV);
    float cellSize = texel.x;

    // Sample neighbors (in screen space: Y+ is down)
    vec4 nw = texture2D(u_state, uv + vec2(-texel.x, -texel.y));
    vec4 n  = texture2D(u_state, uv + vec2(0.0, -texel.y));
    vec4 ne = texture2D(u_state, uv + vec2(texel.x, -texel.y));
    vec4 w  = texture2D(u_state, uv + vec2(-texel.x, 0.0));
    vec4 e  = texture2D(u_state, uv + vec2(texel.x, 0.0));
    vec4 sw = texture2D(u_state, uv + vec2(-texel.x, texel.y));
    vec4 s  = texture2D(u_state, uv + vec2(0.0, texel.y));
    vec4 se = texture2D(u_state, uv + vec2(texel.x, texel.y));

    // Boundaries (as floats for step functions)
    float isTop = step(uv.y, texel.y * 1.5);
    float isBottom = step(1.0 - texel.y * 1.5, uv.y);
    float isLeft = step(uv.x, texel.x * 1.5);
    float isRight = step(1.0 - texel.x * 1.5, uv.x);

    float newState = state;
    float newCountdown = countdown;

    // Decrements per frame (ensure > 1/255 for 8-bit precision)
    float decrement = 1.0 / max(u_lifeFrames, 1.0);
    float delayDecrement = 1.0 / max(u_delayFrames, 1.0);
    float respawnDecrement = 1.0 / max(u_respawnFrames, 1.0);

    // STATE MACHINE

    // IDLE state (state < 0.1)
    if (state < 0.1) {
        float triggered = 0.0;

        // Check each clicked neighbor (state between 0.4 and 0.6)
        float nwClicked = step(0.4, nw.r) * step(nw.r, 0.6) * (1.0 - isTop) * (1.0 - isLeft);
        float nClicked  = step(0.4, n.r)  * step(n.r, 0.6)  * (1.0 - isTop);
        float neClicked = step(0.4, ne.r) * step(ne.r, 0.6) * (1.0 - isTop) * (1.0 - isRight);
        float wClicked  = step(0.4, w.r)  * step(w.r, 0.6)  * (1.0 - isLeft);
        float eClicked  = step(0.4, e.r)  * step(e.r, 0.6)  * (1.0 - isRight);
        float swClicked = step(0.4, sw.r) * step(sw.r, 0.6) * (1.0 - isBottom) * (1.0 - isLeft);
        float sClicked  = step(0.4, s.r)  * step(s.r, 0.6)  * (1.0 - isBottom);
        float seClicked = step(0.4, se.r) * step(se.r, 0.6) * (1.0 - isBottom) * (1.0 - isRight);

        // Random rolls for each direction (use fract to prevent precision loss over time)
        float r0 = hash(gl_FragCoord.xy + vec2(fract(u_time * 3.7), 0.1));
        float r1 = hash(gl_FragCoord.xy + vec2(fract(u_time * 5.3), 0.2));
        float r2 = hash(gl_FragCoord.xy + vec2(fract(u_time * 7.1), 0.3));
        float r3 = hash(gl_FragCoord.xy + vec2(fract(u_time * 11.3), 0.4));
        float r4 = hash(gl_FragCoord.xy + vec2(fract(u_time * 13.7), 0.5));
        float r5 = hash(gl_FragCoord.xy + vec2(fract(u_time * 17.1), 0.6));
        float r6 = hash(gl_FragCoord.xy + vec2(fract(u_time * 19.3), 0.7));
        float r7 = hash(gl_FragCoord.xy + vec2(fract(u_time * 23.7), 0.8));

        // Neighbors spread TO us based on their direction odds
        // Also track which neighbor triggered us to inherit their color
        float t0 = nwClicked * step(r0, u_oddsSE);
        float t1 = nClicked  * step(r1, u_oddsS);
        float t2 = neClicked * step(r2, u_oddsSW);
        float t3 = wClicked  * step(r3, u_oddsE);
        float t4 = eClicked  * step(r4, u_oddsW);
        float t5 = swClicked * step(r5, u_oddsNE);
        float t6 = sClicked  * step(r6, u_oddsN);
        float t7 = seClicked * step(r7, u_oddsNW);

        triggered = t0 + t1 + t2 + t3 + t4 + t5 + t6 + t7;

        if (triggered > 0.5) {
            newState = 0.25;  // KABOOM
            newCountdown = mix(0.7, 1.0, randVal * u_chaos + (1.0 - u_chaos));

            // Inherit color from the first triggering neighbor
            if (t0 > 0.5) { colorHue = nw.b; colorSatVal = nw.a; }
            else if (t1 > 0.5) { colorHue = n.b; colorSatVal = n.a; }
            else if (t2 > 0.5) { colorHue = ne.b; colorSatVal = ne.a; }
            else if (t3 > 0.5) { colorHue = w.b; colorSatVal = w.a; }
            else if (t4 > 0.5) { colorHue = e.b; colorSatVal = e.a; }
            else if (t5 > 0.5) { colorHue = sw.b; colorSatVal = sw.a; }
            else if (t6 > 0.5) { colorHue = s.b; colorSatVal = s.a; }
            else if (t7 > 0.5) { colorHue = se.b; colorSatVal = se.a; }
        }

        // Direct click from target - use NAPLPS color
        if (targetDist < cellSize * 2.5 && u_targetClicked > 0.5) {
            newState = 0.5;  // CLICKED
            newCountdown = 1.0;
            // Store NAPLPS color as hue + sat/val
            colorHue = rgbToHue(u_napColor);
            colorSatVal = rgbToSat(u_napColor) * 0.5 + rgbToVal(u_napColor) * 0.5;
        }
    }
    // KABOOM state (0.2 < state < 0.3)
    else if (state > 0.2 && state < 0.3) {
        newCountdown = countdown - delayDecrement;
        if (newCountdown <= 0.05) {
            newState = 0.5;  // -> CLICKED
            newCountdown = mix(0.7, 1.0, randVal * u_chaos + (1.0 - u_chaos));
        }
    }
    // CLICKED state (0.4 < state < 0.6)
    else if (state > 0.4 && state < 0.6) {
        newCountdown = countdown - decrement;
        if (newCountdown <= 0.05) {
            newState = 0.75;  // -> RESPAWN
            newCountdown = mix(0.7, 1.0, randVal * u_chaos + (1.0 - u_chaos));
        }
    }
    // RESPAWN state (state > 0.7)
    else if (state > 0.7) {
        newCountdown = countdown - respawnDecrement;
        if (newCountdown <= 0.05) {
            newState = 0.0;  // -> IDLE
            newCountdown = 0.0;
        }
    }

    gl_FragColor = vec4(newState, newCountdown, colorHue, colorSatVal);
}
