#version 300 es
precision highp float;
precision highp int;

// Superfork: old-style building sprites, after the pre-WebGL StructureLayer:
// a tile-quantised diamond footprint (border colour ring, translucent
// territory colour inside) with the colour sprite drawn above the tile.

uniform sampler2D uPalette;
uniform sampler2D uAtlas;        // colour sprite atlas, one row of cells
uniform sampler2D uAffiliation;  // row 1 = unit affiliation (alt view)
uniform int   uMode;             // 0 = footprint, 1 = sprite
uniform int   uAltView;
uniform float uBorderRadius;
uniform float uTerritoryRadius;
uniform float uTerritoryAlpha;
uniform float uAlpha;            // cross-fade with the polygon icons
uniform int   uHighlightMask;
uniform float uHighlightDimAlpha;

in vec2 vWorld;
in vec2 vUV;
flat in vec2 vTile;
flat in float vOwnerID;
flat in float vState;
flat in float vAtlasIdx;
flat in float vMarked;

out vec4 fragColor;

void main() {
  float alpha = uAlpha;
  if (uHighlightMask != 0 &&
      (uHighlightMask & (1 << int(vAtlasIdx + 0.5))) == 0) {
    alpha *= uHighlightDimAlpha;
  }

  if (uMode == 0) {
    // Whole-tile diamond, like the old isometric BFS paint.
    vec2 d = abs(floor(vWorld) - vTile);
    float dist = d.x + d.y;
    if (dist > uBorderRadius) discard;
    bool inner = dist <= uTerritoryRadius;

    vec3 border;
    vec3 territory;
    if (vState > 1.5) {
      border = vec3(90.0, 200.0, 255.0) / 255.0;    // EMP-disabled
      territory = vec3(60.0, 72.0, 96.0) / 255.0;
    } else if (vState > 0.5) {
      border = vec3(150.0) / 255.0;                 // under construction
      territory = border;
    } else if (uAltView != 0) {
      vec3 ac = texelFetch(uAffiliation, ivec2(int(vOwnerID), 1), 0).rgb;
      border = ac;
      territory = ac;
    } else {
      float u = (vOwnerID + 0.5) / float(PALETTE_SIZE);
      territory = texture(uPalette, vec2(u, 0.25)).rgb;
      border = texture(uPalette, vec2(u, 0.75)).rgb;
    }
    if (vMarked > 0.5) border = vec3(0.85, 0.15, 0.15);

    fragColor = inner
      ? vec4(territory, uTerritoryAlpha * alpha)
      : vec4(border, alpha);
    return;
  }

  // Sprite: sample this structure's column.
  vec2 uv = vec2((vAtlasIdx + vUV.x) / float(ATLAS_COLS), vUV.y);
  vec4 c = texture(uAtlas, uv);
  if (c.a < 0.02) discard;
  vec3 rgb = c.rgb;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  if (vState > 1.5) {
    rgb = mix(vec3(lum), vec3(0.45, 0.8, 1.0), 0.45);   // EMP: cold, dead
  } else if (vState > 0.5) {
    rgb = vec3(lum);                                  // under construction
    alpha *= 0.65;
  }
  fragColor = vec4(rgb, c.a * alpha);
}
