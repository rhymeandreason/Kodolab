/* =====================================================================
 *  background.js — the context menu, and the hand-off to the panel.
 *
 *  Chrome gives an image's real `srcUrl` and the `pageUrl` it sits on for
 *  free, which is the whole reason this is an extension and not a form:
 *  the two facts that are tedious to copy by hand arrive together and
 *  cannot be mismatched.
 *
 *  Nothing here reaches the network. The panel does the talking, so a
 *  clip that fails is a window still open with the words already typed.
 * ===================================================================== */
'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clip',
    title: 'Clip to Kodolab',
    contexts: ['image'],
  });
});

/* Injected into the page. Self-contained by necessity — it is serialised
   and evaluated over there, so it closes over nothing from this file.

   Everything it returns is a SUGGESTION. The panel shows it in editable
   fields and a human confirms it before any row is written; see
   tools/images-io.js's header on why the words are not trusted off the
   wire. */
function scrape(src) {
  const text = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  const meta = n =>
    (document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || '';

  /* The caption a figure already carries, if this image is in one. Beats
     any heuristic: someone wrote it about this exact picture. */
  let caption = '';
  const img = [...document.images].find(i => i.currentSrc === src || i.src === src);
  const fig = img && img.closest('figure');
  if (fig) caption = text(fig.querySelector('figcaption'));

  const out = {
    title: meta('og:title') || document.title || '',
    caption,
    credit: meta('citation_authors') || meta('author') || '',
    license: '',
  };

  /* Per-host adapters, for the few places that state licence and author in
     markup rather than in prose. Everywhere else these stay blank and get
     typed, which is the normal case. */
  const host = location.hostname;
  if (/(^|\.)wikimedia\.org$|(^|\.)wikipedia\.org$/.test(host)) {
    out.license = text(document.querySelector('.licensetpl_short')) || out.license;
    const aut = document.querySelector('#fileinfotpl_aut ~ td, .fileinfo-paramfield + td');
    out.credit = text(aut) || out.credit;
    out.title = (document.querySelector('h1') && text(document.querySelector('h1'))
      .replace(/^File:/, '').replace(/\.(jpe?g|png|gif|webp|svg|tiff?)$/i, '')) || out.title;
  } else if (/(^|\.)nih\.gov$/.test(host)) {
    out.credit = meta('citation_authors') || out.credit;
    out.license = text(document.querySelector('.license, .copyright')) || out.license;
  } else if (/(^|\.)rcsb\.org$/.test(host)) {
    out.license = 'CC0';                       // PDB's stated policy for its own imagery
  }
  return out;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'clip' || !info.srcUrl) return;

  let scraped = {};
  try {
    /* activeTab is granted by this very click, so no host permission is
       asked for at install and a page never visited is never readable. */
    const [hit] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrape,
      args: [info.srcUrl],
    });
    scraped = (hit && hit.result) || {};
  } catch (e) {
    // A PDF viewer, a chrome:// page, an iframe with no access. The URLs
    // still came through, so the clip is only missing its suggestions.
    scraped = { note: String(e.message || e) };
  }

  await chrome.storage.local.set({
    pending: { src: info.srcUrl, page: info.pageUrl || (tab && tab.url) || '', ...scraped },
  });

  chrome.windows.create({
    url: chrome.runtime.getURL('panel.html'),
    type: 'popup', width: 560, height: 800,
  });
});
