export const capacity = 64;
const field = `
uniform vec4 uWells[${capacity}];
uniform vec4 uShapes[${capacity}];
uniform vec3 uColors[${capacity}];
uniform float uAttention[${capacity}];
uniform int uCount;
uniform float uTime;
uniform float uAmbient;
vec2 wellOffset(vec2 p, int i) {
  vec2 d = p - uWells[i].xy;
  float c = cos(uShapes[i].y), s = sin(uShapes[i].y);
  return vec2(d.x * c + d.y * s, -d.x * s + d.y * c) / vec2(uWells[i].z * uShapes[i].x, uWells[i].z);
}
float heightAt(vec2 p) {
  float h = sin(p.x * 0.14 + p.y * 0.11) * 0.55 + cos(p.y * 0.18 - p.x * 0.09) * 0.35;
  h += sin(length(p) * 0.7 - uTime * 0.35) * cos(p.x * 0.12 + p.y * 0.09) * 0.055 * uAmbient;
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    vec4 w = uWells[i];
    vec2 d = wellOffset(p, i);
    float r2 = dot(d, d);
    float strength = min(1.0, w.w);
    h += uShapes[i].z * exp(-r2 * 0.23) * strength;
    h -= w.w * exp(-pow(r2, uShapes[i].w) * 1.5);
    h += 0.13 * w.z * exp(-pow(sqrt(r2) - 1.05, 2.0) * 12.0) * strength;
  }
  return h;
}`;

export const terrainVertex = `${field}
varying vec3 vWorld;
varying vec3 vColor;
varying float vRim;
varying float vAlert;
varying float vDash;
varying float vDepth;
varying float vInfluence;
void main() {
  vec3 p = position;
  p.y = heightAt(p.xz);
  vWorld = p;
  vec3 tint = vec3(0.25, 0.55, 0.8) * 0.025;
  float weight = 0.025;
  vRim = 0.0; vAlert = 0.0; vDash = 0.0; vDepth = 0.0; vInfluence = 0.0;
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    vec4 w = uWells[i];
    vec2 d = wellOffset(p.xz, i);
    float r2 = dot(d, d), r = sqrt(r2);
    float influence = exp(-r2 * 0.45) * min(1.0, w.w);
    tint += uColors[i] * influence;
    weight += influence;
    vInfluence = max(vInfluence, influence);
    vDepth = max(vDepth, w.w * exp(-pow(r2, uShapes[i].w) * 1.5));
    float rim = exp(-pow((r - 1.08) * 20.0, 2.0)) * min(1.0, w.w);
    vRim = max(vRim, rim);
    vAlert = max(vAlert, uAttention[i] * exp(-r2 * 0.25) * min(1.0, w.w));
    vDash = max(vDash, rim * uAttention[i] * step(0.0, sin(atan(d.y, d.x) * 22.0)));
  }
  vColor = tint / weight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const terrainFragment = `
uniform float uNight;
uniform vec3 uWarning;
uniform vec3 uReporting;
uniform float uTime;
uniform float uAmbient;
uniform vec4 uSelection;
uniform float uSelectedAngle;
uniform float uFogStart;
uniform float uSelected;
varying vec3 vWorld;
varying vec3 vColor;
varying float vRim;
varying float vAlert;
varying float vDash;
varying float vDepth;
varying float vInfluence;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (normal.y < 0.0) normal = -normal;
  vec3 light = normalize(vec3(-0.5, 1.0, 0.65));
  float diffuse = max(dot(normal, light), 0.0);
  float depth = clamp(vDepth / 4.6, 0.0, 1.0);
  vec3 color = mix(vec3(0.92, 0.935, 0.91), vec3(0.012, 0.026, 0.042), uNight);
  vec3 core = mix(vec3(0.009, 0.067, 0.18), vColor * 0.14, 0.3);
  color = mix(color, core, smoothstep(0.0, 0.80, depth));
  color *= 0.34 + diffuse * 0.77;
  vec3 view = normalize(cameraPosition - vWorld);
  float sheen = pow(max(dot(normal, normalize(light + view)), 0.0), 48.0);
  color += vec3(0.10, 0.14, 0.16) * sheen * (1.0 - depth * 0.7);
  color += vColor * exp(-pow((depth - 0.28) * 9.0, 2.0)) * mix(0.035, 0.09, uNight);
  float band = vWorld.y * 11.0;
  float contour = 1.0 - smoothstep(0.0, max(fwidth(band) * 1.2, 0.045), abs(fract(band - 0.5) - 0.5));
  vec3 ink = mix(vColor * 0.32, vColor * 0.85, uNight);
  color = mix(color, ink, contour * mix(0.52, 0.67, uNight) * smoothstep(0.05, 0.5, vInfluence));
  vec2 coordinates = vWorld.xz * 0.85;
  vec2 grid = abs(fract(coordinates - 0.5) - 0.5) / max(fwidth(coordinates), vec2(0.001));
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  float gridFade = 1.0 - smoothstep(25.0, 75.0, distance(cameraPosition, vWorld));
  color = mix(color, mix(vec3(0.49, 0.58, 0.62), vec3(0.12, 0.20, 0.25), uNight), line * 0.055 * gridFade);
  float grain = (hash(floor(vWorld.xz * 95.0)) - 0.5) * 0.009;
  color += grain * mix(1.0, 0.25, uNight);
  float sweep = pow(0.5 + 0.5 * sin(vWorld.x * 0.24 + vWorld.z * 0.17 - uTime * 0.20), 24.0);
  color += vec3(0.035, 0.10, 0.15) * sweep * uAmbient * mix(0.025, 0.05, uNight);
  vec3 rimColor = mix(mix(vColor, uReporting, 0.2), uWarning, smoothstep(0.15, 0.55, vAlert));
  color += rimColor * vRim * mix(0.20, 0.56, uNight);
  color = mix(color, uWarning * 1.1, vDash * 0.8);
  vec2 selectedDelta = vWorld.xz - uSelection.xy;
  float c = cos(uSelectedAngle), s = sin(uSelectedAngle);
  vec2 selectedOffset = vec2(selectedDelta.x * c + selectedDelta.y * s, -selectedDelta.x * s + selectedDelta.y * c) / vec2(uSelection.z * uSelection.w, uSelection.z);
  float selection = exp(-pow((length(selectedOffset) - 1.38) * 12.0, 2.0)) * uSelected;
  color += vec3(0.10, 0.28, 0.42) * selection * 0.2;
  vec3 haze = mix(vec3(0.91, 0.94, 0.94), vec3(0.012, 0.026, 0.045), uNight);
  color = mix(color, haze, smoothstep(uFogStart, uFogStart + 65.0, distance(cameraPosition, vWorld)));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const skyVertex = `
varying vec3 vDirection;
void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const skyFragment = `
uniform float uNight;
uniform float uTime;
uniform float uAmbient;
varying vec3 vDirection;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDirection);
  float altitude = clamp(d.y, 0.0, 1.0);
  vec3 day = mix(vec3(0.91, 0.94, 0.94), vec3(0.62, 0.75, 0.81), smoothstep(0.0, 0.8, altitude));
  vec3 night = mix(vec3(0.012, 0.026, 0.045), vec3(0.002, 0.005, 0.014), smoothstep(0.0, 0.65, altitude));
  float cloud = sin(d.x * 3.0 + d.z * 4.0) * sin(d.z * 7.0 - d.y * 5.0) * 0.5 + 0.5;
  float nebula = exp(-pow((d.y - d.x * 0.3 - d.z * 0.25 - 0.25) * 5.0, 2.0)) * cloud;
  night += vec3(0.005, 0.008, 0.018) * nebula;
  vec2 uv = vec2(atan(d.z, d.x) / 6.283185 + 0.5, asin(d.y) / 3.141593 + 0.5);
  vec2 cell = floor(uv * vec2(850.0, 425.0));
  vec2 point = fract(uv * vec2(850.0, 425.0));
  float star = (1.0 - smoothstep(0.025, 0.13, length(point - 0.5))) * step(0.987, hash(cell));
  star *= smoothstep(-0.02, 0.25, d.y) * (0.7 + 0.15 * sin(uTime * 0.3 + hash(cell) * 6.0) * uAmbient);
  vec3 color = mix(day, night, uNight) + vec3(0.45, 0.58, 0.72) * star * uNight;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
