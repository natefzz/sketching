#extension GL_OES_standard_derivatives : enable
precision mediump float;

varying vec3 vPosition, vNormal;
varying vec2 brightnessA;
varying vec2 brightnessB;
varying vec2 brightnessC;
varying vec2 vCurvatureA;
varying vec2 vCurvatureB;
varying vec2 vCurvatureC;
varying vec3 vCoordA;
varying vec3 vCoordB;
varying vec3 vCoordC;

uniform vec3 resolution;
uniform float pixelRatio;
uniform float scale;
uniform float numTextures;
uniform sampler2D pencilTextures;
uniform vec3 eye;
uniform int styleMode;  // 0=pencil, 1=charcoal, 2=ink, 3=sketch

// Simple pseudo-random function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Better noise function to avoid grid artifacts
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec4 sample(vec2 brightness, vec3 basepoint, vec2 curvature) {
    vec2 device = (gl_FragCoord.xy - basepoint.xy / basepoint.z) / resolution.y;
    vec2 dir = length(curvature) > 0.0 ? normalize(curvature) : vec2(0.0, 1.0);
    vec2 uv = vec2(dot(dir, device), -dir.y * device.x + dir.x * device.y);

    vec2 texCoords = fract(0.5 + scale * uv);
    float level = numTextures - 1.0 - floor(numTextures * brightness.x / brightness.y);
    texCoords.y = (level + texCoords.y) / numTextures;
    return texture2D(pencilTextures, texCoords);
}

// Apply charcoal effect - grainy, blocky, organic
vec3 applyCharcoal(vec3 baseColor) {
    // Less darkening for more reflective feel
    baseColor = baseColor * 0.85;

    // Finer grain noise - increased frequency for smaller white dots
    float coarseNoise = random(floor(gl_FragCoord.xy * 0.8)) * 0.12;  // Slightly higher intensity for brightness
    float fineNoise = random(gl_FragCoord.xy * 0.5) * 0.06;            // More fine highlights
    baseColor = baseColor + vec3(coarseNoise + fineNoise);

    // Less contrast reduction to preserve highlights
    baseColor = pow(baseColor, vec3(0.92));

    // Smaller blocky pattern with more variation
    float blockPattern = random(floor(gl_FragCoord.xy * 0.25)) * 0.08;
    baseColor = baseColor + vec3(blockPattern);

    // Lighter edges for more reflective charcoal
    float edgeFactor = smoothstep(0.2, 0.75, baseColor.r);
    return mix(vec3(0.15), baseColor, edgeFactor);
}

// Apply ink effect - high contrast, binary
vec3 applyInk(vec3 baseColor) {
    // Increase contrast significantly
    baseColor = pow(baseColor, vec3(1.5));

    // Add subtle hatching lines
    float lines = abs(sin(gl_FragCoord.x * 0.5 + gl_FragCoord.y * 0.3)) * 0.05;
    baseColor = baseColor + vec3(lines);

    // Sharpen edges
    float intensity = (baseColor.r + baseColor.g + baseColor.b) / 3.0;
    intensity = smoothstep(0.4, 0.6, intensity);
    return vec3(intensity);
}

// Apply sketch effect - loose, light, hand-drawn
vec3 applySketch(vec3 baseColor) {
    // Darken slightly to reduce white reflections
    baseColor = baseColor * 0.92;

    // Multi-scale smooth noise for irregular sketch texture - reduced intensity
    float noise1 = noise(gl_FragCoord.xy * 0.04) * 0.10;
    float noise2 = noise(gl_FragCoord.xy * 0.08) * 0.08;
    float noise3 = noise(gl_FragCoord.xy * 0.16) * 0.06;
    baseColor = baseColor + vec3(noise1 + noise2 + noise3);

    // Paper grain texture - reduced
    float paperGrain = noise(gl_FragCoord.xy * 0.25) * 0.08;
    baseColor = baseColor + vec3(paperGrain);

    // Irregular sketchy texture - reduced
    float sketchBlock1 = noise(gl_FragCoord.xy * 0.03) * 0.09;
    float sketchBlock2 = noise(gl_FragCoord.xy * 0.06) * 0.06;
    baseColor = baseColor + vec3(sketchBlock1 + sketchBlock2);

    // Fine texture - reduced
    float fineTexture = noise(gl_FragCoord.xy * 0.35) * 0.05;
    baseColor = baseColor + vec3(fineTexture);

    // Minimal contrast adjustment
    baseColor = pow(baseColor, vec3(0.95));

    return clamp(baseColor, 0.0, 1.0);
}

void main() {
	vec4 textureA = sample(brightnessA, vCoordA, vCurvatureA) * brightnessA.y;
	vec4 textureB = sample(brightnessB, vCoordB, vCurvatureB) * brightnessB.y;
	vec4 textureC = sample(brightnessC, vCoordC, vCurvatureC) * brightnessC.y;

	vec3 baseColor = (textureA + textureB + textureC).xyz;

    // Apply cartoon edge detection
    float vDotN = abs(dot(normalize(vNormal), normalize(vPosition - eye)));
    float vDotNGrad = fwidth(vDotN);
    float cartoonEdge = smoothstep(0.75, 1.25, vDotN / vDotNGrad / 3.0 / pixelRatio);

    // Apply style-specific effects
    vec3 finalColor = baseColor;

    if (styleMode == 1) {
        // Charcoal
        finalColor = applyCharcoal(baseColor);
        finalColor = mix(vec3(0.2), finalColor, cartoonEdge);
    } else if (styleMode == 2) {
        // Ink
        finalColor = applyInk(baseColor);
        finalColor = mix(vec3(0.1), finalColor, cartoonEdge);
    } else if (styleMode == 3) {
        // Sketch - very soft edges, minimal outline
        finalColor = applySketch(baseColor);
        // Very light edge color, almost no outline
        finalColor = mix(vec3(0.75), finalColor, cartoonEdge);
    } else {
        // Pencil (default)
        finalColor = mix(vec3(0.3), baseColor, cartoonEdge);
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
