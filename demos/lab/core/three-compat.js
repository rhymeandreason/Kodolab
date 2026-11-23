/* The three.js differences between r128 and r155+, in one place, while pages move from one
 * to the other (page.js pins the version; a page or ?three= can override it).
 * Once every lab is on the new version, inline these and delete the file.
 *
 *   LEGACY        true on r128
 *   LIGHT         multiply a light's intensity by this: r155+ dropped the hidden ×π of legacy lights
 *   DECAY         a punctual light's decay. 0 on r155+ keeps r128's no-falloff look
 *   srgb(tex)     mark a colour texture or render target as sRGB
 *   srgbOut(r)    make a renderer output sRGB
 *   linearOut(r)  make a renderer output linear, r128's default
 *
 * Colour management stays OFF on r155+, so a raw hex means what it meant on r128 (README
 * "Colours"). This runs at import, so import this module before anything builds a Color.
 */
import * as THREE from 'three';

export const REVISION = parseInt(THREE.REVISION, 10);
export const LEGACY = REVISION < 152;
export const LIGHT = REVISION >= 155 ? Math.PI : 1;
export const DECAY = REVISION >= 155 ? 0 : 1;

if (THREE.ColorManagement) THREE.ColorManagement.enabled = false;

/* r163+ ignores a material's envMapIntensity when its reflection comes from scene.environment
   (scene.environmentIntensity wins), so the labs' per-material reflection strengths and
   Ecoli's dimming under UV would do nothing. Give such a material the environment as its own
   envMap on first draw, which r163+ does scale. */
if (!LEGACY) {
  THREE.Material.prototype.onBeforeRender = function (renderer, scene) {
    if (this.envMap === null && scene.environment && (this.isMeshStandardMaterial || this.isMeshLambertMaterial || this.isMeshPhongMaterial)) {
      this.envMap = scene.environment;
    }
  };
}

export function srgb(t) {
  if (LEGACY) t.encoding = THREE.sRGBEncoding; else t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function srgbOut(r) {
  if (LEGACY) r.outputEncoding = THREE.sRGBEncoding; else r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
/** Output without the sRGB step, as an r128 renderer that never set outputEncoding drew. */
export function linearOut(r) {
  if (!LEGACY) r.outputColorSpace = THREE.LinearSRGBColorSpace;
  return r;
}
/** The final fragment chunk a material hook replaces: `output_fragment`, renamed in r154. */
export const OUTPUT_CHUNK = REVISION >= 154 ? '#include <opaque_fragment>' : '#include <output_fragment>';
