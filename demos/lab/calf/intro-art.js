/* The intro card's calf, cycling through a seizure: trembling rest, a rigid (tonic) arch, then
 * paddling (clonic). One <img> swaps frames, because stacked frames double their soft shadows.
 * Frame order and timings are Calf.tsx's in his repo (the critical calf). */
(function () {
  const img = document.getElementById('calfImg');
  if (!img || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const REST = 3200, TONIC = 1600, CLONIC = 5200, TOTAL = REST + TONIC + CLONIC;
  const src = (f) => 'art/calf-' + f + '.webp';
  ['rest-2', 'tonic', 'clonic-1', 'clonic-2', 'clonic-3'].forEach((f) => { new Image().src = src(f); });
  function frameAt(t) {
    t %= TOTAL;
    if (t < REST) return Math.floor(t / 170) % 2 ? 'rest-2' : 'rest-1';
    if (t < REST + TONIC) return 'tonic';
    return 'clonic-' + (Math.floor((t - REST - TONIC) / 190) % 3 + 1);
  }
  const t0 = performance.now();
  let shown = 'rest-1';
  const id = setInterval(() => {
    if (document.getElementById('intro').classList.contains('hide')) { clearInterval(id); return; }
    const f = frameAt(performance.now() - t0);
    if (f !== shown) { shown = f; img.src = src(f); }
  }, 40);
})();
