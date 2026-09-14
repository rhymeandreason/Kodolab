/* =============================================================================
 *  Story.scroll(sections, onPart) — the scroll of a story page (css/story.css)
 * =============================================================================
 *  Three jobs, and only the first of them needs a library:
 *
 *  MOMENTUM is Lenis, which the page loads first. It wraps the browser's own
 *  scroll rather than replacing it, so the scrollbar, the keyboard, anchor
 *  links and `position:fixed` all keep working.
 *
 *  WHICH PART IS SHOWING is IntersectionObserver, with the viewport squeezed to
 *  a line across its middle: exactly one section can be crossing that line, so
 *  there is no "nearest" to compute. onPart(i) gets that section's index.
 *
 *  THE SETTLE parks a section's middle on that line once the reader stops. A
 *  section is most of a window tall, so `scroll-snap-type:proximity` never
 *  fires and `mandatory` snaps on load.
 *
 *  Call it AFTER the page's first show(): the observer fires on its first
 *  check, and a firing into a page with nothing shown yet is a dead page.
 * ========================================================================== */
(function(){
  // SETTLE_MS is how long "stopped" is. Under about 100 it fires inside the
  // momentum and takes the scroll out of the reader's hands.
  const SETTLE_MS = 150, SNAP_SLOP = 8;

  function scroll(secs, onPart){
    const lenis = new Lenis({ autoRaf:true, duration:1.1 });

    const seen = new IntersectionObserver(entries => {
      for(const e of entries) if(e.isIntersecting) onPart(secs.indexOf(e.target));
    }, { root:null, rootMargin:'-50% 0px -50% 0px', threshold:0 });
    for(const el of secs) seen.observe(el);

    // Measured when the settle runs: a resize changes every height.
    const settleTo = el => el.offsetTop + el.offsetHeight / 2 - innerHeight / 2;

    let settleTimer = null, settling = false;
    lenis.on('scroll', () => {
      if(settling) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        let best = null, bestD = Infinity;
        for(const el of secs){
          const d = Math.abs(settleTo(el) - lenis.scroll);
          if(d < bestD){ bestD = d; best = el; }
        }
        if(!best || bestD <= SNAP_SLOP) return;
        settling = true;
        lenis.scrollTo(settleTo(best), {
          duration:0.6, easing:t => 1 - Math.pow(1 - t, 3),
          onComplete:() => { settling = false; },
        });
      }, SETTLE_MS);
    });

    return lenis;
  }

  window.Story = { scroll };
})();
