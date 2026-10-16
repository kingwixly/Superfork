#version 300 es
precision highp float;
precision highp int;

// Superfork: old-style building sprites (see StructureSpritePass.ts).

layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aInst0; // x, y, ownerID, state (0 ok, 1 building, 2 EMP)
layout(location = 2) in vec3 aInst1; // atlasIdx, markedForDeletion, tier

uniform mat3  uCamera;
uniform int   uMode;          // 0 = footprint, 1 = sprite
uniform float uBorderRadius;  // tiles
uniform float uSize;          // sprite size, tiles
uniform float uLiftY;         // tiles

out vec2 vWorld;
out vec2 vUV;
flat out vec2 vTile;
flat out float vOwnerID;
flat out float vState;
flat out float vAtlasIdx;
flat out float vMarked;
flat out float vTier;

void main() {
  vTile = aInst0.xy;
  vOwnerID = aInst0.z;
  vState = aInst0.w;
  vAtlasIdx = aInst1.x;
  vMarked = aInst1.y;
  vTier = aInst1.z;

  vec2 center = aInst0.xy + 0.5;
  vec2 worldPos;
  if (uMode == 0) {
    float half_ = uBorderRadius + 1.0;
    worldPos = center + (aPos - 0.5) * half_ * 2.0;
  } else {
    worldPos = center + vec2(0.0, -uLiftY) + (aPos - 0.5) * uSize;
  }
  vWorld = worldPos;
  vUV = aPos;

  vec3 clip = uCamera * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
