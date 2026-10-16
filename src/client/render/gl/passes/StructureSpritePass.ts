/**
 * StructureSpritePass — superfork: old-style colour building sprites.
 *
 * Once the camera is zoomed in past `structure.sprites.zoom`, structures are
 * drawn the way the pre-WebGL StructureLayer drew them: a tile-quantised
 * diamond footprint in the owner's colours, with a full-colour building
 * sprite above it. StructurePass's polygon icons cross-fade out over the
 * same zoom range (see `spriteBlend`), so the two never fight.
 *
 * Two instanced draws per frame: every footprint first, then every sprite,
 * so a neighbour's footprint never paints over a building.
 *
 * Sprites come from `atlases/structure-sprite-atlas.png`, packed by
 * scripts/generate-sprite-atlases.mjs from resources/icons/structures_hd/ in
 * STRUCTURE_ORDER, the same column contract as the polygon icon atlas. Each
 * row is a level tier (see `spriteTier`), so a building's sprite can change
 * as it levels up.
 */

import type { RendererConfig, UnitState } from "../../types";
import { DynamicInstanceBuffer } from "../DynamicBuffer";
import type { RenderSettings } from "../RenderSettings";
import { getPaletteSize } from "../utils/ColorUtils";
import { createProgram, shaderSrc } from "../utils/GlUtils";
import { STRUCTURE_ORDER } from "./StructurePass";

import { assetUrl } from "@openfront/shared/AssetUrls";
import fragSrc from "../shaders/structure-sprite/structure-sprite.frag.glsl?raw";
import vertSrc from "../shaders/structure-sprite/structure-sprite.vert.glsl?raw";

const spriteAtlasUrl = assetUrl("atlases/structure-sprite-atlas.png");

const ATLAS_COLS = STRUCTURE_ORDER.length;
/**
 * Rows in the sprite atlas, one per level tier. MUST match SPRITE_TIERS in
 * scripts/generate-sprite-atlases.mjs.
 */
export const SPRITE_TIERS = 4;
// Per-instance: x, y, ownerID, state, atlasIdx, markedForDeletion, tier
const FLOATS_PER_INSTANCE = 7;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * How far into sprite mode a zoom level is: 0 = polygon icons only, 1 =
 * sprites only. Shared with StructurePass so the cross-fade is symmetric.
 */
export function spriteBlend(settings: RenderSettings, zoom: number): number {
  const s = settings.structure.sprites;
  if (!s.enabled) return 0;
  const t = (zoom - s.zoom) / Math.max(s.fadeRange, 1e-3);
  return Math.min(1, Math.max(0, t));
}

/**
 * Which atlas row (0-based tier) a structure at `level` uses, from
 * `structure.sprites.levelTiers`.
 */
export function spriteTier(
  settings: RenderSettings,
  unitType: string,
  level: number,
): number {
  const tiers = settings.structure.sprites.levelTiers;
  const thresholds = tiers[unitType] ?? tiers.default ?? [];
  let tier = 0;
  for (const min of thresholds) {
    if (level >= min) tier++;
  }
  return Math.min(tier, SPRITE_TIERS - 1);
}

export class StructureSpritePass {
  private gl: WebGL2RenderingContext;
  private settings: RenderSettings;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: DynamicInstanceBuffer;
  private instanceCount = 0;
  private atlasTex: WebGLTexture;
  private atlasReady = false;
  private paletteTex: WebGLTexture;
  private affiliationTex: WebGLTexture | null = null;
  private altView = false;
  private highlightMask = 0;
  private typeToAtlasCol = new Map<string, number>();
  private mapW: number;

  private uCamera: WebGLUniformLocation;
  private uMode: WebGLUniformLocation;
  private uAltView: WebGLUniformLocation;
  private uBorderRadius: WebGLUniformLocation;
  private uTerritoryRadius: WebGLUniformLocation;
  private uTerritoryAlpha: WebGLUniformLocation;
  private uSize: WebGLUniformLocation;
  private uLiftY: WebGLUniformLocation;
  private uAlpha: WebGLUniformLocation;
  private uHighlightMask: WebGLUniformLocation;
  private uHighlightDimAlpha: WebGLUniformLocation;

  constructor(
    gl: WebGL2RenderingContext,
    header: RendererConfig,
    paletteTex: WebGLTexture,
    settings: RenderSettings,
  ) {
    this.gl = gl;
    this.settings = settings;
    this.paletteTex = paletteTex;
    this.mapW = header.mapWidth;

    for (const t of header.unitTypes) {
      const col = STRUCTURE_ORDER.indexOf(
        t as (typeof STRUCTURE_ORDER)[number],
      );
      if (col >= 0) this.typeToAtlasCol.set(t, col);
    }

    this.program = createProgram(
      gl,
      shaderSrc(vertSrc, {}),
      shaderSrc(fragSrc, {
        PALETTE_SIZE: getPaletteSize(),
        ATLAS_COLS,
        ATLAS_ROWS: SPRITE_TIERS,
      }),
      "StructureSpritePass",
    );
    const loc = (n: string) => gl.getUniformLocation(this.program, n)!;
    this.uCamera = loc("uCamera");
    this.uMode = loc("uMode");
    this.uAltView = loc("uAltView");
    this.uBorderRadius = loc("uBorderRadius");
    this.uTerritoryRadius = loc("uTerritoryRadius");
    this.uTerritoryAlpha = loc("uTerritoryAlpha");
    this.uSize = loc("uSize");
    this.uLiftY = loc("uLiftY");
    this.uAlpha = loc("uAlpha");
    this.uHighlightMask = loc("uHighlightMask");
    this.uHighlightDimAlpha = loc("uHighlightDimAlpha");

    gl.useProgram(this.program);
    gl.uniform1i(loc("uPalette"), 0);
    gl.uniform1i(loc("uAtlas"), 1);
    gl.uniform1i(loc("uAffiliation"), 2);

    this.atlasTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    void this.loadAtlas();

    const glBuf = gl.createBuffer()!;
    this.instanceBuf = new DynamicInstanceBuffer(
      gl,
      glBuf,
      2048,
      FLOATS_PER_INSTANCE,
    );

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf.buffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, BYTES_PER_INSTANCE, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, BYTES_PER_INSTANCE, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  private async loadAtlas(): Promise<void> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = spriteAtlasUrl;
    try {
      await img.decode();
    } catch (e) {
      console.warn("structure sprite atlas failed to load", e);
      return;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    // Pixel art: crisp when magnified.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasReady = true;
  }

  /** True once the sprites can actually be drawn (the atlas has loaded). */
  isReady(): boolean {
    return this.atlasReady;
  }

  setAffiliationTex(tex: WebGLTexture): void {
    this.affiliationTex = tex;
  }

  setAltView(active: boolean): void {
    this.altView = active;
  }

  setHighlightTypes(unitTypes: string[] | null): void {
    let mask = 0;
    for (const t of unitTypes ?? []) {
      const col = this.typeToAtlasCol.get(t);
      if (col !== undefined) mask |= 1 << col;
    }
    this.highlightMask = mask;
  }

  updateStructures(units: Map<number, UnitState>): void {
    let count = 0;
    for (const unit of units.values()) {
      if (!unit.isActive) continue;
      const col = this.typeToAtlasCol.get(unit.unitType);
      if (col === undefined) continue;
      this.instanceBuf.ensureCapacity(count + 1);
      const off = count * FLOATS_PER_INSTANCE;
      const x = unit.pos % this.mapW;
      const f = this.instanceBuf.float32;
      f[off] = x;
      f[off + 1] = (unit.pos - x) / this.mapW;
      f[off + 2] = unit.ownerID;
      f[off + 3] = unit.underConstruction ? 1 : unit.disabled ? 2 : 0;
      f[off + 4] = col;
      f[off + 5] = unit.markedForDeletion !== false ? 1 : 0;
      f[off + 6] = spriteTier(this.settings, unit.unitType, unit.level);
      count++;
    }
    this.instanceCount = count;
    if (count > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf.buffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.instanceBuf.float32,
        0,
        count * FLOATS_PER_INSTANCE,
      );
    }
  }

  draw(cameraMatrix: Float32Array, zoom: number): void {
    if (this.instanceCount === 0 || !this.atlasReady) return;
    const t = spriteBlend(this.settings, zoom);
    if (t <= 0) return;

    const gl = this.gl;
    const s = this.settings.structure.sprites;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1i(
      this.uAltView,
      this.altView && this.settings.altView.recolorStructures ? 1 : 0,
    );
    gl.uniform1f(this.uBorderRadius, s.borderRadius);
    gl.uniform1f(this.uTerritoryRadius, s.territoryRadius);
    gl.uniform1f(this.uTerritoryAlpha, s.territoryAlpha);
    gl.uniform1f(this.uSize, s.size);
    gl.uniform1f(this.uLiftY, s.liftY);
    gl.uniform1f(this.uAlpha, t);
    gl.uniform1i(this.uHighlightMask, this.highlightMask);
    gl.uniform1f(
      this.uHighlightDimAlpha,
      this.settings.structure.highlightDimAlpha,
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    if (this.affiliationTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.affiliationTex);
    }

    gl.bindVertexArray(this.vao);
    gl.uniform1i(this.uMode, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    gl.uniform1i(this.uMode, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    this.instanceBuf.dispose();
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.atlasTex);
  }
}
