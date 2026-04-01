#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    vec4 state = texture2D(u_state, uv);

    float stateVal = state.r;
    float countdown = state.g;  // Use this for alpha - goes from 1.0 to 0.0
    float colorVal = state.a;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    if (stateVal > 0.4 && stateVal < 0.6) {
        // CLICKED state - bright, use countdown for fade
        float gray = 0.5 + 0.5 * colorVal;
        color = vec3(gray);
        alpha = 0.5 + countdown * 0.5;  // Fade from 1.0 to 0.5
    } else if (stateVal > 0.2 && stateVal < 0.3) {
        // KABOOM state - pulsing glow
        color = vec3(0.4);
        alpha = 0.3 + countdown * 0.4;
    } else if (stateVal > 0.7) {
        // RESPAWN state - dim
        color = vec3(0.15);
        alpha = countdown * 0.3;
    }

    gl_FragColor = vec4(color * alpha, 1.0);
}
