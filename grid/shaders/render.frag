#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform float u_time;

// Convert HSV to RGB
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    vec4 state = texture2D(u_state, uv);

    float stateVal = state.r;
    float countdown = state.g;   // Use this for alpha - goes from 1.0 to 0.0
    float colorHue = state.b;    // NAPLPS hue
    float colorSatVal = state.a; // Combined sat/val

    // Reconstruct saturation and value from combined
    float sat = clamp(colorSatVal * 1.5, 0.3, 1.0);
    float val = clamp(colorSatVal + 0.3, 0.5, 1.0);

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    if (stateVal > 0.4 && stateVal < 0.6) {
        // CLICKED state - bright, use NAPLPS color
        color = hsv2rgb(vec3(colorHue, sat, val));
        alpha = 0.6 + countdown * 0.4;  // Fade from 1.0 to 0.6
    } else if (stateVal > 0.2 && stateVal < 0.3) {
        // KABOOM state - pulsing glow, dimmer version of color
        color = hsv2rgb(vec3(colorHue, sat * 0.5, val * 0.6));
        alpha = 0.3 + countdown * 0.4;
    } else if (stateVal > 0.7) {
        // RESPAWN state - dim
        color = hsv2rgb(vec3(colorHue, sat * 0.2, val * 0.3));
        alpha = countdown * 0.3;
    }

    gl_FragColor = vec4(color * alpha, 1.0);
}
