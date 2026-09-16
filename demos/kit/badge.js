/* =============================================================================
 *  kit/badge.js — a round icon button pinned to a point in a 3D scene
 * =============================================================================
 *  A door out of the scene, sitting on the thing it opens: the ATP synthase
 *  in the membrane carries a "see more" badge, and clicking it opens the real
 *  protein. A hotspot (kit/hotspot.js) is an action ON the chemistry; a badge
 *  is extra content ABOUT a part, so it looks like chrome, not like the scene.
 *
 *   · DRIVEN EVERY FRAME, after the render, like a name plate: the camera
 *     eases, and a badge pinned to last frame's camera drifts off its part.
 *   · NO POINT MEANS NO BADGE. `at()` returning null hides it; it is never
 *     parked at the origin, where it would be a live button in empty space.
 *   · THE ICON SAYS WHAT KIND OF DOOR. `Badge.ICONS` is the vocabulary, so
 *     every "see more" in the product is the same glyph. Add a kind there,
 *     never an inline SVG on a page.
 *
 *  Loaded after THREE. Exposes window.Badge. Styles: kit/badge.css.
 *
 *    const b = Badge.create({ host, camera, canvas, at: () => worldVec3,
 *                             icon: 'more', label: 'See the real protein',
 *                             onClick: () => modal.show() });
 *    box.on('frame', b.update);   // or from afterFrame
 *    b.destroy();
 * ========================================================================== */
(function (global) {
  'use strict';

  const ICONS = {
    /* A magnifier with a plus: look closer. */
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>',
  };

  function create(opts) {
    const THREE = global.THREE;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'badge';
    el.innerHTML = ICONS[opts.icon] || ICONS.more;
    el.setAttribute('aria-label', opts.label || 'See more');
    el.title = opts.label || 'See more';
    el.hidden = true;
    el.addEventListener('click', ev => { ev.stopPropagation(); if (opts.onClick) opts.onClick(); });
    if (getComputedStyle(opts.host).position === 'static') opts.host.style.position = 'relative';
    opts.host.appendChild(el);
    const v = new THREE.Vector3();
    const off = opts.offset || [0, 0];

    function update() {
      const p = opts.at();
      if (!p) { el.hidden = true; return; }
      v.copy(p).project(opts.camera);
      const c = opts.canvas.getBoundingClientRect(), h = opts.host.getBoundingClientRect();
      const x = (v.x * .5 + .5) * c.width + c.left - h.left + off[0];
      const y = (-v.y * .5 + .5) * c.height + c.top - h.top + off[1];
      el.hidden = v.z > 1 || x < 0 || y < 0 || x > h.width || y > h.height;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    return { el, update, destroy: () => el.remove() };
  }

  global.Badge = { create, ICONS };
})(window);
