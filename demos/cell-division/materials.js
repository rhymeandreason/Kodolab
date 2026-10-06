/* cell-division/materials.js: colours, shaders, shared geometries, materials and textures. */
(function (CD) {
  'use strict';

  /* Every colour is lib/palette.js's `division`, except the nucleolus. */
  const P = window.MolPalette;
  const O = P.organelles;
  const D = P.division;
  CD.COLORS = {
    maternal: D.maternal,
    paternal: D.paternal,
    kinetochore: D.kinetochore,
    chiasma: D.chiasma,
    ring: D.ring,
    microtubule: D.microtubule,
    kfiber: D.kfiber,
    centriole: D.centriole,
    halo: D.halo,
    nucleolus: O.nucleus.nucleolus,
    membraneTint: D.membraneTint,
    membraneRim: D.membrane,
    membraneDeep: D.membraneDeep,
    nucTint: D.envelopeTint,
    nucRim: D.envelope,
    nucPore: D.envelopePore,
    nucEdge: D.envelopeEdge,
  };

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const raw = (hex) => new THREE.Color(hex);
  CD.lin = lin;

  // ---------------------------------------------------------------- shaders
  const VERT = /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    varying vec3 vObj;
    void main() {
      vObj = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `;

  // Translucent plasma membrane: soft fresnel rim + glossy highlights.
  const MEMBRANE_FRAG = /* glsl */ `
    uniform vec3 uTint;
    uniform vec3 uRim;
    uniform vec3 uDeep;
    uniform float uOpacity;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(vV);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fres = pow(1.0 - ndv, 2.3);
      vec3 L1 = normalize(vec3(0.45, 0.8, 0.55));
      vec3 L2 = normalize(vec3(-0.7, 0.15, 0.6));
      float spec = pow(max(dot(N, normalize(L1 + V)), 0.0), 80.0);
      float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 26.0) * 0.22;
      vec3 col = mix(uTint, uRim, smoothstep(0.0, 1.0, fres));
      col = mix(col, uDeep, pow(fres, 3.0) * 0.55);
      col += vec3(spec + spec2);
      float a = uOpacity * (0.075 + 0.9 * fres) + spec * 0.6 + spec2 * 0.35;
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    }
  `;

  // Nuclear envelope: fresnel shell with pores that dissolves into fragments.
  const NUCLEUS_FRAG = /* glsl */ `
    uniform vec3 uTint;
    uniform vec3 uRim;
    uniform vec3 uPore;
    uniform vec3 uEdge;
    uniform float uOpacity;
    uniform float uDissolve;
    varying vec3 vN;
    varying vec3 vV;
    varying vec3 vObj;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }

    void main() {
      float nz = noise(vObj * 3.2) * 0.62 + noise(vObj * 7.5 + 3.1) * 0.38;
      float thr = uDissolve * 1.12 - 0.06;
      if (nz < thr) discard;
      float edge = (1.0 - smoothstep(0.0, 0.07, nz - thr)) * step(0.001, uDissolve);

      vec3 N = normalize(vN);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(vV);
      float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
      float fres = pow(1.0 - ndv, 2.0);
      float spec = pow(max(dot(N, normalize(normalize(vec3(0.45, 0.8, 0.55)) + V)), 0.0), 60.0);

      vec3 q = normalize(vObj) * 10.0;
      float pore = 1.0 - smoothstep(0.12, 0.2, length(fract(q) - 0.5));

      vec3 col = mix(uTint, uRim, fres);
      col = mix(col, uPore, pore * 0.55);
      col = mix(col, uEdge, edge);
      col += vec3(spec * 0.8);
      float a = uOpacity * (0.1 + 0.75 * fres) + pore * 0.13 + edge * 0.55 + spec * 0.4;
      if (!gl_FrontFacing) a *= 0.55;
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    }
  `;

  CD.makeMembraneMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTint: { value: raw(CD.COLORS.membraneTint) },
        uRim: { value: raw(CD.COLORS.membraneRim) },
        uDeep: { value: raw(CD.COLORS.membraneDeep) },
        uOpacity: { value: 0.62 },
      },
      vertexShader: VERT,
      fragmentShader: MEMBRANE_FRAG,
      transparent: true,
      depthWrite: false,
    });

  CD.makeNucleusMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTint: { value: raw(CD.COLORS.nucTint) },
        uRim: { value: raw(CD.COLORS.nucRim) },
        uPore: { value: raw(CD.COLORS.nucPore) },
        uEdge: { value: raw(CD.COLORS.nucEdge) },
        uOpacity: { value: 0.55 },
        uDissolve: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: NUCLEUS_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

  // ---------------------------------------------------------------- textures
  function canvasTexture(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  function radial(stops) {
    return (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    };
  }

  // ---------------------------------------------------------------- shared resources
  CD.initShared = function () {
    CD.tex = {
      glow: canvasTexture(128, radial([
        [0, 'rgba(255,255,255,1)'],
        [0.25, 'rgba(255,255,255,0.55)'],
        [0.6, 'rgba(255,255,255,0.12)'],
        [1, 'rgba(255,255,255,0)'],
      ])),
    };

    CD.geo = {
      kin: new THREE.SphereGeometry(1, 16, 12),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
      centriole: new THREE.CylinderGeometry(0.042, 0.042, 0.2, 18, 1),
      nucleus: new THREE.SphereGeometry(1, 72, 54),
      nucleolus: new THREE.SphereGeometry(1, 32, 24),
      ring: new THREE.TorusGeometry(1, 0.035, 10, 140).rotateX(Math.PI / 2),
    };

    CD.mat = {
      kin: new THREE.MeshStandardMaterial({
        color: lin(CD.COLORS.kinetochore),
        emissive: lin(CD.COLORS.kinetochore),
        emissiveIntensity: 0.35,
        roughness: 0.35,
      }),
      kfiber: new THREE.MeshStandardMaterial({
        color: lin(CD.COLORS.kfiber),
        roughness: 0.5,
        transparent: true,
        opacity: 0.9,
      }),
      fiberLine: new THREE.LineBasicMaterial({
        color: lin(CD.COLORS.microtubule),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      centriole: new THREE.MeshStandardMaterial({ color: lin(CD.COLORS.centriole), roughness: 0.48 }),
      halo: new THREE.SpriteMaterial({
        map: CD.tex.glow,
        color: lin(CD.COLORS.halo),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      membrane: CD.makeMembraneMaterial(),
    };
  };
})(window.CD);
