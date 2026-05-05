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
  gl_Position = uProj * uView * vec4(aPos, 1.0);
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

  // Blinn-Phong diffuse + ambient
  float NdotL  = max(dot(N, L), 0.0);
  vec3  diff   = vColour.rgb * uSunColour * NdotL * uSunIntensity;
  vec3  ambient= vColour.rgb * uAmbient;
  vec3  colour = ambient + diff;

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
uniform float uDaylight;   // 0=night 1=day
uniform vec3  uSunDir;
uniform float uHueShift;   // world hue base (0-360)

out vec4 fragColour;

// Quick hash for star field
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec3 dir = normalize(vDir);
  float t  = clamp(dir.y, -1.0, 1.0);

  // Sky gradient
  vec3 sky = t > 0.0
    ? mix(uSkyHorizon, uSkyTop, pow(t, 0.4))
    : mix(uSkyHorizon, uSkyHorizon*0.3, pow(-t, 0.5));

  // Sun disc
  float sunDot = dot(dir, normalize(uSunDir));
  if(sunDot > 0.998) sky = mix(sky, vec3(1.4,1.2,0.8), smoothstep(0.998,1.0,sunDot)*uDaylight);
  // Sun glow
  sky += vec3(1.0,0.9,0.6)*0.15*pow(max(0.0,sunDot),6.0)*uDaylight;

  // Stars at night
  if(uDaylight < 0.8){
    float starBright = (1.0-uDaylight)*0.8;
    vec2 uv = vec2(atan(dir.z,dir.x), acos(dir.y))*8.0;
    float star = step(0.97, hash(floor(uv)));
    sky += vec3(star)*starBright*0.7;
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
