// ─────────────────────────────────────────────────────────────────────────────
// TERRAIN SHADER — vertex-coloured, lit by directional sun + ambient
// Uses the biome colour baked into vertex colour attribute
// ─────────────────────────────────────────────────────────────────────────────
export const TERRAIN_VERT = `#version 300 es
precision highp float;

layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColour;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCamPos;

out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vColour;

void main(){
  vWorldPos   = aPos;
  vNormal     = aNormal;
  vColour     = aColour;

  vec4 viewPos = uView * vec4(aPos, 1.0);

  // Vertices at or behind camera get w=0 → degenerate, fully discarded by GPU
  if(viewPos.z >= -0.3){
    gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
  } else {
    gl_Position = uProj * viewPos;
  }
}
`;

export const TERRAIN_FRAG = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vColour;

uniform vec3  uSunDir;
uniform vec3  uSunColour;
uniform float uSunIntensity;
uniform vec3  uAmbient;
uniform float uFogDensity;
uniform vec3  uFogColour;
uniform vec3  uCamPos;

out vec4 fragColour;

void main(){
  vec3 N   = normalize(vNormal);
  vec3 L   = normalize(uSunDir);

  // Diffuse: NdotL, zero when sun is below horizon
  float light   = max(dot(N, L), 0.0) * step(0.0, L.y);
  vec3  diff    = vColour.rgb * uSunColour * light * uSunIntensity;
  vec3  ambient = vColour.rgb * uAmbient;
  vec3  colour  = ambient + diff;

  // Specular on water (blue tint, high gloss)
  float isWater = step(0.8, vColour.b) * (1.0 - step(0.3, vColour.r));
  if(isWater > 0.5){
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 64.0);
    colour += vec3(0.8, 0.9, 1.0) * spec * 0.6;
  }

  // Distance fog
  float dist = length(uCamPos - vWorldPos);
  float fog  = 1.0 - exp(-uFogDensity * dist * dist);
  colour = mix(colour, uFogColour, clamp(fog, 0.0, 0.85));

  fragColour = vec4(colour, vColour.a);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// SKY SHADER — gradient from horizon colour + zenith, stars at night
// ─────────────────────────────────────────────────────────────────────────────
export const SKY_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vDir;
void main(){
  vDir = aPos;
  mat4 v = uView;
  v[3]   = vec4(0,0,0,1); // remove translation
  vec4 pos = uProj * v * vec4(aPos * 500.0, 1.0);
  gl_Position = pos.xyww; // max depth
}
`;

export const SKY_FRAG = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3  uSkyTop;
uniform vec3  uSkyHorizon;
uniform float uDaylight;
uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform float uHueShift;

out vec4 fragColour;

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec3 dir = normalize(vDir);
  float t  = clamp(dir.y, -1.0, 1.0);

  float nightAmt = 1.0 - uDaylight;

  // Night base: dark blue so sky box faces are invisible (no seams)
  vec3 nightTop     = vec3(0.01, 0.02, 0.06);
  vec3 nightHorizon = vec3(0.02, 0.03, 0.07);

  // Day sky gradient
  vec3 dayTop     = uSkyTop;
  vec3 dayHorizon = uSkyHorizon;

  // Blend day/night base
  vec3 top     = mix(nightTop,     dayTop,     uDaylight);
  vec3 horizon = mix(nightHorizon, dayHorizon, uDaylight);

  vec3 sky = t > 0.0
    ? mix(horizon, top, pow(t, 0.4))
    : mix(horizon, nightHorizon * 0.3, pow(-t, 0.4));

  // Stars — visible at night across full upper hemisphere
  if(nightAmt > 0.1 && dir.y > -0.1){
    // Two layers of stars at different scales for variety
    vec2 uv1 = vec2(atan(dir.z, dir.x), acos(clamp(dir.y, 0.001, 1.0))) * 18.0;
    vec2 uv2 = vec2(atan(dir.z, dir.x), acos(clamp(dir.y, 0.001, 1.0))) * 35.0;
    float s1 = step(0.94, hash(floor(uv1)));
    float s2 = step(0.96, hash(floor(uv2)));
    float twinkle = 0.6 + 0.4 * hash(floor(uv1) + vec2(7.3, 3.1));
    sky += vec3(0.9, 0.92, 1.0) * (s1 + s2 * 0.6) * twinkle * nightAmt;
  }

  // Moon disc
  if(nightAmt > 0.1){
    vec3 moonDir = normalize(uMoonDir);
    float moonDot = dot(dir, moonDir);
    // Moon disc
    float moonDisc = smoothstep(0.9992, 1.0, moonDot);
    sky = mix(sky, vec3(0.90, 0.92, 1.00) * nightAmt, moonDisc);
    // Moon glow halo
    sky += vec3(0.15, 0.18, 0.30) * pow(max(0.0, moonDot), 12.0) * nightAmt * 0.5;
  }

  // Sun disc + glow
  if(uDaylight > 0.0){
    vec3 sunDir = normalize(uSunDir);
    float sunDot = dot(dir, sunDir);
    float sunDisc = smoothstep(0.9990, 1.0, sunDot);
    sky = mix(sky, vec3(1.6, 1.4, 1.0), sunDisc * uDaylight);
    float glow = pow(max(0.0, sunDot), 4.0);
    sky += vec3(1.0, 0.75, 0.3) * 0.25 * glow * uDaylight;
  }

  fragColour = vec4(sky, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// HUD SHADER — 2D overlay (coords, world name, crosshair)
// ─────────────────────────────────────────────────────────────────────────────
export const HUD_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const HUD_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColour;
out vec4 fragColour;
void main(){ fragColour = uColour; }
`;
