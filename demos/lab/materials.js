/* Shared materials.
 *
 *   const mat = createMaterials(stage);
 *   mesh(geo, mat.glass);                 // shared: never mutate (narrow: tubes, rods)
 *   mesh(geo, mat.wideGlass);             // beakers, petri dishes (mat.widePlastic: cups)
 *   mesh(geo, mat.make.glass({ opacity: .2, color: '#dbe7f2' }));   // your own copy
 *   mesh(geo, mat.make.liquid(0xe0d64a));
 *
 * Colours are raw hex (colour management off, as on r128), matching the labs. The
 * renderer outputs sRGB, so a raw hex renders lighter than it looks in a colour
 * picker. To get the colour you picked, pass toLinear('#9fcfae').
 *
 * Transparent things draw in renderOrder: liquid 1, stream 2, glass/plastic 3,
 * rims 4, printed labels 5-6. Glass after liquid, or the liquid disappears.
 */
import * as THREE from 'three';
import { OUTPUT_CHUNK } from './core/three-compat.js';

/** A hex picked in sRGB (a colour picker, a photo) as the value three wants, so it renders as picked. */
export const toLinear = (hex) => new THREE.Color(hex).convertSRGBToLinear().getHex();

/* Glass (from the Ecoli lab): real glass is almost invisible face-on. You read
 * it from Fresnel edges (grey silhouettes where you look through the wall at a
 * glancing angle) and from sharp reflections of lights. So: very low alpha
 * face-on, alpha + grey tint rising toward the silhouette, and specular
 * highlights pushed into alpha so they stay bright instead of being faded by
 * the transparency.
 *
 * Replaces the last fragment chunk (OUTPUT_CHUNK, renamed in r154). */

/* How strongly every glass and clear plastic draws its silhouette, shared by all of them so
 * one change (props.html's sliders) restyles every vessel live:
 *   strength  multiplies each material's own `edge` alpha
 *   width     widens (>1) or narrows (<1) the band the edge occupies toward the silhouette
 *   dark      how much the edge darkens, like the refracted surroundings: 1 is the original */
export const GLASS_LOOK = { uEdgeK: { value: 2.2 }, uEdgeW: { value: 1.3 }, uEdgeD: { value: 1.4 } };
const LOOK_GLSL = 'uniform float uEdgeK, uEdgeW, uEdgeD;\n';
const edgeFrom = (lo) => `smoothstep(1.0 - ${(1 - lo).toFixed(2)} * uEdgeW, 1.0, gFr)`;
const darken = (k) => `(1.0 - ${(1 - k).toFixed(2)} * uEdgeD)`;

export function glassMaterial({ opacity = 0.32, color = '#e3ecf6', roughness = 0.03, envMap = null, envMapIntensity = 1.5, edge = 0.85, side = THREE.DoubleSide } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, transparent: true, opacity,
    clearcoat: 1, clearcoatRoughness: 0.02, side, depthWrite: false, envMap, envMapIntensity,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GLASS_LOOK);
    sh.fragmentShader = LOOK_GLSL + sh.fragmentShader.replace(OUTPUT_CHUNK, `
      float gFr  = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float gEdge = ${edgeFrom(0.3)};                    // 0 face-on -> 1 at the silhouette
      gEdge *= gEdge;
      vec3 gDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
      vec3 gSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      float gSpecL = dot(gSpec, vec3(.299,.587,.114));
      vec3 gCol = mix(gDiff + gSpec, gDiff * max(0.0, ${darken(0.32)}) + gSpec, gEdge); // edges darken like refracted surroundings
      float gA = diffuseColor.a*.22 + gEdge*${edge.toFixed(3)}*uEdgeK + smoothstep(.04,.5,gSpecL)*.9;
      gl_FragColor = vec4(gCol, clamp(gA, 0.0, 1.0));
    `);
  };
  m.userData.shell = true;  // core/sketch.js outlines what is inside it
  // distinct program per edge value
  m.customProgramCacheKey = () => 'lab-glass-' + edge;
  return m;
}

/* Wide glass: beakers, cups, petri dishes. glassMaterial is tuned for narrow
 * tubes; on a wide vessel its strip reflections and broad Fresnel band show up
 * on both the near and far wall and read as stripes. Here:
 *   - a soft, strip-free env (stage.wideGlassEnv) gives one smooth highlight
 *   - the Fresnel edge is confined to a thin line at the silhouette, so the
 *     wall outline reads without grey bands across the body
 *   - the far wall (back faces) is mostly suppressed: faint tint, almost no
 *     reflections, so lights aren't doubled
 *   - reflections add to alpha gently, as a soft sheen instead of hot spots */
export function wideGlassMaterial({ opacity = 0.3, color = '#e6eef6', roughness = 0.06, envMap = null, envMapIntensity = 1.1, edge = 0.7, back = 0.35, side = THREE.DoubleSide } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, transparent: true, opacity,
    clearcoat: 0.6, clearcoatRoughness: 0.08, side, depthWrite: false, envMap, envMapIntensity,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GLASS_LOOK);
    sh.fragmentShader = LOOK_GLSL + sh.fragmentShader.replace(OUTPUT_CHUNK, `
      float gFr  = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float gEdge = ${edgeFrom(0.62)};                   // thin line at the silhouette only
      gEdge *= gEdge;
      float gFront = gl_FrontFacing ? 1.0 : ${back.toFixed(3)};
      vec3 gDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
      vec3 gSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      gSpec *= gl_FrontFacing ? 1.0 : 0.12;
      float gSpecL = dot(gSpec, vec3(.299,.587,.114));
      vec3 gCol = mix(gDiff + gSpec, gDiff * max(0.0, ${darken(0.45)}) + gSpec, gEdge);
      float gA = (diffuseColor.a*.2 + gEdge*${edge.toFixed(3)}*uEdgeK) * gFront + smoothstep(.08,.9,gSpecL)*.5;
      gl_FragColor = vec4(gCol, clamp(gA, 0.0, 1.0));
    `);
  };
  m.userData.shell = true;
  m.customProgramCacheKey = () => 'lab-wide-glass-' + edge + '-' + back;
  return m;
}

export function createMaterials(stage) {
  const glassEnv = stage && stage.glassEnv;
  const wideEnv = stage && (stage.wideGlassEnv || stage.glassEnv);
  const shared = (m) => { m.userData.shared = true; return m; };
  const shell = (m) => { m.userData.shell = true; return m; };
  const std = (color, roughness = 0.45, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness }, o));

  const make = {
    glass: (o = {}) => glassMaterial(Object.assign({ envMap: glassEnv }, o)),
    /* Clear plastic: same optics as glass, a touch softer and bluer. */
    plastic: (o = {}) => glassMaterial(Object.assign({ envMap: glassEnv, opacity: 0.3, color: '#d6e2ee', roughness: 0.1, envMapIntensity: 1.2, edge: 0.6 }, o)),
    /* For beakers, cups, petri dishes: see wideGlassMaterial. */
    wideGlass: (o = {}) => wideGlassMaterial(Object.assign({ envMap: wideEnv }, o)),
    widePlastic: (o = {}) => wideGlassMaterial(Object.assign({ envMap: wideEnv, opacity: 0.28, color: '#d9e4ef', roughness: 0.14, envMapIntensity: 0.95, edge: 0.55 }, o)),
    liquid: (color = 0x5aa9e6, opacity = 0.5, o = {}) => {
      const m = new THREE.MeshPhysicalMaterial(Object.assign({
        color, roughness: 0.06, transparent: true, opacity, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide,
      }, o));
      m.userData.liquid = true;  // core/sketch.js draws its outline stronger: the level is what a student reads
      return m;
    },
    solid: std,
    /* Any other lit material goes through these, never `new THREE.Mesh*Material` in a prop,
     * so one change here restyles every prop. Unlit effects (light cones, screens, ripples) may use MeshBasicMaterial. */
    standard: (o = {}) => new THREE.MeshStandardMaterial(o),
    physical: (o = {}) => new THREE.MeshPhysicalMaterial(o),
  };

  return {
    make,
    glass: shared(make.glass()),
    glassRim: shared(make.glass({ opacity: 0.5, color: '#c3d1de', edge: 0.6 })),
    /* The moulded lip and foot of lab glass: denser than the wall, so the opening and the base
       read even face-on. Rings from glassware.js's edgeRing(). Not a shell: the outline inks it. */
    glassEdge: shared(new THREE.MeshStandardMaterial({ color: toLinear('#9db0c2'), roughness: 0.2, transparent: true, opacity: 0.75, depthWrite: false, envMapIntensity: 1.3 })),
    plastic: shared(make.plastic()),
    wideGlass: shared(make.wideGlass()),
    widePlastic: shared(make.widePlastic()),
    frosted: shell(shared(new THREE.MeshPhysicalMaterial({ color: 0xe9eef3, roughness: 0.35, transparent: true, opacity: 0.8, envMapIntensity: 1.2, depthWrite: false }))),
    ldpe: shell(shared(new THREE.MeshPhysicalMaterial({ color: 0xdde5e0, roughness: 0.32, transparent: true, opacity: 0.88, envMapIntensity: 1.1, depthWrite: false }))),
    water: shared(make.liquid()),
    white: shared(std(0xf7f8f9, 0.42)),
    whiteMatte: shared(std(0xf2f3f4, 0.75)),
    rodPlastic: shared(std(0xf1f4f7, 0.35)),
    chrome: shared(std(0xe3e7ec, 0.2, { metalness: 1 })),
    steel: shared(std(0xc8ced6, 0.32, { metalness: 0.9 })),
    rubber: shared(std(0x2b2f35, 0.6)),
    teal: shared(std(0x14a38f, 0.62)),
    charcoal: shared(std(0x39414b, 0.5)),
    slate: shared(std(0x5f6f82, 0.45)),
    blue: shared(std(0x2563eb, 0.4)),
    orange: shared(std(0xf97316, 0.45)),
    powder: shared(std(0xfbfbfa, 1)),
    paper: shared(std(0xfcfcfa, 0.95)),
    bubble: shared(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1, envMapIntensity: 2.5 })),
    soap: shared(new THREE.MeshPhysicalMaterial({ color: 0xe9ec8a, roughness: 0.1, transparent: true, opacity: 0.8, depthWrite: false })),
  };
}
