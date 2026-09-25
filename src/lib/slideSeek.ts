/**
 * Showing one slide at one step.
 *
 * A deck document holds every slide at once, so anything that displays a
 * slide has to say WHICH slide and HOW FAR through its build. That is the
 * whole contract, and it is deliberately one contract: the board's card, the
 * board's stage, the presenting window, the PDF page and the video frame all
 * ask the same question of the same document, so what you rehearse is what
 * you present is what you export.
 *
 * Builds: an element carrying `data-step="N"` arrives on the Nth press;
 * anything without one is on from the start. Revealing is a CSS class the
 * document itself styles, so a slide can animate its arrival however it likes
 * — and because the state is set rather than played, it is seekable: step 2
 * looks identical whether you pressed twice or jumped straight to it. That is
 * what lets a build render deterministically to a page or a frame.
 */

/**
 * Nothing is ever cropped.
 *
 * A slide is authored at a fixed canvas size, so content that grows past it
 * — a fourth card, a longer paragraph, a bigger font on another machine —
 * simply vanishes off the bottom. Losing the last point of an argument
 * silently is the worst failure this app could have, so an overflowing
 * slide is scaled to fit instead: sized to its content, centred in the
 * frame, and shrunk by whatever it takes.
 *
 * Slides that already fit are not touched at all, so the author's layout is
 * left exactly as written in the ordinary case.
 *
 * Shipped as source rather than called directly, because it has to run inside
 * the rendered document. Every view injects THIS string — thumbnail, stage,
 * presentation, captured frame and printed page alike — so none of them can
 * drift into disagreeing about what fits. The box is passed in because the
 * screen reads it off the deck root and the printer off the page box.
 */
export const FIT_SLIDE_FN = `
function fitSlide(el, boxW, boxH) {
  if (!el || !el.style) return;

  // Restore the author's OWN inline style before measuring.
  //
  // Removing individual properties is wrong here: a slide's inline style is
  // where its own position/inset live, so clearing those to
  // "reset" deletes the author's layout and the slide renders as nothing.
  // The original string is stashed once and put back on every pass, so a
  // fit is always computed against the slide as written.
  if (el.getAttribute('data-pv-style') === null) {
    el.setAttribute('data-pv-style', el.getAttribute('style') || '');
  }
  el.setAttribute('style', el.getAttribute('data-pv-style'));

  if (!boxW || !boxH) return;

  // Measure the slide laid out at frame WIDTH with its height free, so
  // lines wrap exactly as they will when presented and the box grows to
  // whatever the content actually needs.
  //
  // border-box, because the width being imposed is the frame's OUTER width.
  // Under the default content-box a padded slide measures 128px wider than
  // the frame it fills perfectly, and a slide holding two lines of text is
  // "overflowing" and gets shrunk for nothing.
  el.style.boxSizing = 'border-box';
  el.style.position = 'absolute';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = boxW + 'px';
  el.style.height = 'auto';

  // Not scrollHeight: on a flex column whose content overflows, the bottom
  // padding is left out of it, so the measurement comes up short and the
  // last card is still clipped after scaling — which is precisely the bug
  // this whole pass exists to prevent. Every descendant is asked where it
  // actually ends, and the author's padding is added on top so the content
  // still clears the edge once shrunk.
  var own = el.getBoundingClientRect();
  var cs = getComputedStyle(el);
  var padB = parseFloat(cs.paddingBottom) || 0;
  var padR = parseFloat(cs.paddingRight) || 0;
  var needH = el.offsetHeight;
  var needW = boxW;
  var kids = el.querySelectorAll('*');
  for (var i = 0; i < kids.length; i++) {
    var rect = kids[i].getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    // A pinned descendant sits where it is told, outside the padding flow:
    // a full-bleed picture or clip at inset 0 ends at the slide's edge and
    // must not be read as overflowing by the slide's own bottom padding.
    var pinnedPos = getComputedStyle(kids[i]).position;
    var pinned = pinnedPos === 'absolute' || pinnedPos === 'fixed';
    needH = Math.max(needH, rect.bottom - own.top + (pinned ? 0 : padB));
    needW = Math.max(needW, rect.right - own.left + (pinned ? 0 : padR));
  }

  // Two things that both carry content must not sit on top of each other.
  //
  // The growth rule below only separates a PINNED element from FLOWING
  // content, because growing the box is what moves a bottom-anchored element
  // down. It cannot help when both are pinned — a headline at top:116 and a
  // paragraph at top:270 that the headline wraps into — and scaling cannot
  // either, since shrinking the slide preserves the overlap exactly. Those
  // are a fault in the document, not in the view, so they are measured here
  // and reported for the deck check to raise rather than papered over.
  //
  // Only elements that carry visible content count. A slide's background
  // wash and its card are absolutely positioned boxes lying under
  // everything, and an empty box behind content is the design. Nesting is
  // the other exemption: a caption inside the image it labels is deliberate.
  function carriesContent(node) {
    // A layer that declares itself the background is allowed to sit under
    // everything — a full-bleed image and the scrim over it are the design.
    if (node.hasAttribute('data-bg')) return false;
    if (node.tagName === 'IMG' || node.tagName === 'SVG') return true;
    for (var c = 0; c < node.childNodes.length; c++) {
      var child = node.childNodes[c];
      if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) {
        return true;
      }
    }
    return false;
  }

  function reportCollisions() {
    var found = contentCollisions();
    fitSlide.lastCollisions = found;
    if (found.length) {
      el.setAttribute('data-pv-overlaps', String(found.length));
    } else {
      el.removeAttribute('data-pv-overlaps');
    }
  }

  function contentCollisions() {
    var boxes = [];
    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      if (node.hasAttribute('data-notes')) continue;
      if (!carriesContent(node)) continue;
      var r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      var cs2 = getComputedStyle(node);
      if (cs2.visibility === 'hidden' || cs2.opacity === '0') continue;
      boxes.push({ node: node, rect: r });
    }
    var found = [];
    for (var a = 0; a < boxes.length; a++) {
      for (var b = a + 1; b < boxes.length; b++) {
        var one = boxes[a];
        var two = boxes[b];
        if (one.node.contains(two.node) || two.node.contains(one.node)) continue;
        var down = Math.min(one.rect.bottom, two.rect.bottom) -
          Math.max(one.rect.top, two.rect.top);
        var across = Math.min(one.rect.right, two.rect.right) -
          Math.max(one.rect.left, two.rect.left);
        if (down > 1 && across > 1) {
          found.push({
            a: (one.node.textContent || one.node.tagName).trim().slice(0, 40),
            b: (two.node.textContent || two.node.tagName).trim().slice(0, 40),
            overlap: Math.round(down)
          });
        }
      }
    }
    return found;
  }

  // Nothing overlaps anything unless the author meant it to.
  //
  // A pinned footer — position: absolute, bottom: 64px — is the common way a
  // deck puts a line under its content, and it collides silently: the flow
  // content above simply grows through it and the two render on top of each
  // other. Nothing has left the frame, so the overflow rule above sees no
  // problem at all.
  //
  // So a collision is treated as a reason to need more height. Growing the
  // box pushes a bottom-anchored element down by exactly the growth, which
  // separates it from the content; the scale below then shrinks the taller
  // box back into the frame. A couple of passes because separating one pair
  // can reflow another, and elements anchored to the TOP do not move when
  // the box grows — those settle by scaling instead of by separating, so the
  // loop is bounded rather than run to convergence.
  //
  // Elements deliberately laid over one another — a caption on an image, a
  // label on a chart — are nested inside what they overlap, and a descendant
  // sitting on its own ancestor is the design, not a collision. Only
  // unrelated elements count.
  for (var pass = 0; pass < 3; pass++) {
    el.style.height = needH + 'px';
    var pinned = [];
    var flowing = [];
    for (var n = 0; n < kids.length; n++) {
      var node = kids[n];
      if (node.hasAttribute('data-notes')) continue;
      var box = node.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      var pos = getComputedStyle(node).position;
      if (pos === 'absolute' || pos === 'fixed') {
        // Only a pinned element that CARRIES something needs separating from
        // the content — a footer with a line of text under a column of cards.
        // A background wash (data-bg, or any empty decorative layer) overlaps
        // every flowing child by definition, and growing the box to "clear"
        // it is a runaway: the wash is inset to the box, so it grows too, the
        // overlap never resolves, and three passes later the slide is triple
        // height and renders as a sliver.
        if (carriesContent(node)) pinned.push({ node: node, rect: box });
      } else {
        flowing.push({ node: node, rect: box });
      }
    }

    var push = 0;
    for (var a = 0; a < pinned.length; a++) {
      for (var b = 0; b < flowing.length; b++) {
        var one = pinned[a];
        var two = flowing[b];
        if (one.node.contains(two.node) || two.node.contains(one.node)) continue;
        var over = Math.min(one.rect.bottom, two.rect.bottom) -
          Math.max(one.rect.top, two.rect.top);
        var across = Math.min(one.rect.right, two.rect.right) -
          Math.max(one.rect.left, two.rect.left);
        if (over > 1 && across > 1) push = Math.max(push, over);
      }
    }
    if (!push) break;
    // Clear it by the overlap plus a line's breathing space, so the two are
    // separated rather than left exactly touching.
    needH += push + 24;
  }
  el.style.height = 'auto';

  // A pixel or two of rounding is not an overflow worth reflowing for.
  // Put the author's style back untouched and leave the slide alone.
  if (needW <= boxW + 2 && needH <= boxH + 2) {
    el.setAttribute('style', el.getAttribute('data-pv-style'));
    reportCollisions();
    return;
  }

  var scale = Math.min(boxW / needW, boxH / needH);
  // Back to the author's style, then the fit on top of it.
  //
  // Anchored top-left and centred by a pixel translate, never by
  // top:50% + translate(-50%): a box taller than the frame whose layout
  // position starts above the frame is split across sheets by a printer's
  // fragmentation, and the sheet then shows the slide shifted and cut.
  // Clipping the slide's own overflow makes it monolithic to the printer —
  // laid on one sheet whole — and hides nothing, since the box was grown
  // to hold every descendant. Screen and paper are the same picture.
  el.setAttribute('style', el.getAttribute('data-pv-style'));
  el.style.boxSizing = 'border-box';
  el.style.position = 'absolute';
  el.style.width = needW + 'px';
  el.style.height = needH + 'px';
  el.style.inset = 'auto';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.overflow = 'hidden';
  el.style.transformOrigin = 'top left';
  el.style.transform = 'translate(' + ((boxW - needW * scale) / 2) + 'px, ' +
    ((boxH - needH * scale) / 2) + 'px) scale(' + scale + ')';
  reportCollisions();
}
`

/**
 * The seek engine's version — part of every render fingerprint, so a change
 * to how slides are shown, stepped or fitted re-verifies every slide.
 */
export const SEEK_ENGINE = 'seek-4'

/**
 * The core every renderer shares, as source: which child is slide i, how
 * a step is applied, how a slide is fitted, and what a measurement is worth.
 *
 * The board's frames drive ONE root (the deck's); the print document
 * drives one root PER PAGE. Both call these with the root in hand, so the
 * page and the preview cannot disagree about what a slide looks like at a
 * step — there is no second implementation to drift.
 */
export const SEEK_CORE_FN = `
${FIT_SLIDE_FN}

function slideChildrenOf(root) {
  if (!root) return [];
  var out = [];
  for (var i = 0; i < root.children.length; i++) {
    if (root.children[i].hasAttribute('data-slide')) out.push(root.children[i]);
  }
  return out;
}

// A deck whose root IS the slide has no children carrying data-slide; the
// root stands in as slide 0. The app reports it the same way, and the two
// must agree or every index is off by a level.
function slideIn(root, i) {
  if (!root) return null;
  var kids = slideChildrenOf(root);
  if (!kids.length) return i === 0 ? root : null;
  return kids[i] || null;
}

function showSlideIn(root, i) {
  var kids = slideChildrenOf(root);
  if (!kids.length) return;
  for (var n = 0; n < kids.length; n++) {
    kids[n].style.display = n === i ? '' : 'none';
  }
}

// Revealing is a CLASS, not an inline style: the document decides what
// arriving looks like. Setting the state rather than playing it is what
// makes a build seekable — and therefore printable and renderable.
function applyStepsIn(root, i, step) {
  var slide = slideIn(root, i);
  if (!slide) return;
  var built = slide.querySelectorAll('[data-step]');
  for (var n = 0; n < built.length; n++) {
    var wanted = parseFloat(built[n].getAttribute('data-step'));
    var on = !isFinite(wanted) || wanted <= step;
    built[n].classList.toggle('pv-in', on);
    built[n].classList.toggle('pv-out', !on);
  }
}

/** How many presses a slide takes. */
function stepsOf(slide) {
  if (!slide) return 0;
  var built = slide.querySelectorAll('[data-step]');
  var highest = 0;
  for (var n = 0; n < built.length; n++) {
    var value = parseFloat(built[n].getAttribute('data-step'));
    if (isFinite(value) && value > highest) highest = value;
  }
  return highest;
}

function fitIn(root, i) {
  if (!root) return;
  fitSlide(
    slideIn(root, i),
    root.clientWidth || parseFloat(root.getAttribute('data-width')) || 0,
    root.clientHeight || parseFloat(root.getAttribute('data-height')) || 0
  );
}

// The author's inline style is stashed BEFORE anything mutates it.
//
// showSlide works by writing display into each slide's inline style, so a
// stash taken lazily inside fitSlide reads the style AFTER the author's
// own display — a slide's display: flex — has been overwritten. Restoring
// that stash lays the slide out as a block: the gap is gone, the vertical
// centring is gone, and nothing says why.
function stashAuthorStylesIn(root) {
  var kids = slideChildrenOf(root);
  for (var n = 0; n < kids.length; n++) {
    if (kids[n].getAttribute('data-pv-style') === null) {
      kids[n].setAttribute('data-pv-style', kids[n].getAttribute('style') || '');
    }
  }
}

// Video on a slide plays when the slide comes up and stops when it goes —
// on the surfaces that are LIVE (the stage, presenting), never in a card, a
// measurement, a print or a frame capture, which show its first frame. The
// state is set, not played: showing slide 3 twice does not restart its
// clip, and a step press leaves it running. Sound is tried first; where
// the surface may not play sound the clip plays muted rather than not at
// all. \`data-video-play="manual"\` opts a clip out of starting on its own.
function syncMediaIn(root, i) {
  if (!root) return;
  var live = document.documentElement.getAttribute('data-live') === 'true';
  var kids = slideChildrenOf(root);
  var all = kids.length ? kids : [root];
  for (var n = 0; n < all.length; n++) {
    var videos = all[n].querySelectorAll('video');
    for (var v = 0; v < videos.length; v++) {
      var video = videos[v];
      var showing = n === i && live;
      if (!showing) {
        if (!video.paused) { try { video.pause(); } catch (e) {} }
        video.removeAttribute('data-pv-playing');
        continue;
      }
      if (video.getAttribute('data-video-play') === 'manual') continue;
      if (video.getAttribute('data-pv-playing') === String(i)) continue;
      video.setAttribute('data-pv-playing', String(i));
      try { video.currentTime = 0; } catch (e) {}
      (function (clip) {
        var attempt = clip.play();
        if (attempt && attempt.catch) {
          attempt.catch(function () {
            clip.muted = true;
            var again = clip.play();
            if (again && again.catch) again.catch(function () {});
          });
        }
      })(video);
    }
  }
}

/** Show slide i at a step and fit it: THE render, for every surface. */
function renderSlideIn(root, i, step) {
  showSlideIn(root, i);
  applyStepsIn(root, i, step);
  fitIn(root, i);
  syncMediaIn(root, i);
  return fitSlide.lastCollisions || [];
}

// A measurement is only worth something when the frame had geometry. A
// hidden tab or an occluded window lays nothing out, every box is 0×0, and
// zero overflow there is indistinguishable from "fits" — so it is reported
// as not measured rather than as clean.
function measuredIn(root) {
  if (!root || document.hidden) return false;
  var rect = root.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// The fonts half of the render fingerprint: which faces the document knew
// when it measured, and whether they had all arrived. A render measured
// while a web font was still loading is never trusted.
function fontsEvidence() {
  var fonts = document.fonts;
  if (!fonts) return { status: 'unavailable', signature: '' };
  var names = [];
  try {
    fonts.forEach(function (face) {
      names.push(face.family + '/' + face.weight + '/' + face.style);
    });
  } catch (e) {}
  names.sort();
  return {
    status: fonts.status === 'loaded' ? 'loaded' : 'loading',
    signature: names.join(',')
  };
}
`

/** Injected into every rendered slide. Dependency-free and defensive. */
export function slideScript(slideIndex: number, step: number): string {
  const index = Number.isFinite(slideIndex) ? Math.max(0, slideIndex) : 0
  const at = Number.isFinite(step) ? Math.max(0, step) : 0
  return `<script>(function () {
  var current = ${index};
  var step = ${at};

  function deckRoot() {
    return document.querySelector('[data-deck-id]') || document.getElementById('deck');
  }

  ${SEEK_CORE_FN}

  function slideChildren() {
    return slideChildrenOf(deckRoot());
  }

  function slideAt(i) {
    return slideIn(deckRoot(), i);
  }

  function apply() {
    var root = deckRoot();
    var overlaps = renderSlideIn(root, current, step);
    document.documentElement.setAttribute('data-slide-index', String(current));
    document.documentElement.setAttribute('data-slide-step', String(step));
    // What this frame measured, and under what conditions, goes out to be
    // shown against the slide — and to decide whether the render can be
    // trusted at all. Overlaps the fit could not separate are a fault in the
    // document; a measurement taken hidden or before fonts arrived is not a
    // measurement.
    var fonts = fontsEvidence();
    parent.postMessage({
      type: 'pureslides:layout',
      slide: current,
      step: step,
      overlaps: overlaps,
      measured: measuredIn(root),
      fonts: fonts.status,
      fontsSignature: fonts.signature
    }, '*');
  }

  // The name the renderer calls, and the name the app calls: one function.
  window.__slideShow = window.__deckShow = function (nextSlide, nextStep) {
    if (typeof nextSlide === 'number' && isFinite(nextSlide)) current = nextSlide;
    if (typeof nextStep === 'number' && isFinite(nextStep)) step = nextStep;
    apply();
  };

  /**
   * The name the shell's frame-sequence renderer calls.
   *
   * It hands one number per instant, and a deck instant is two: the whole
   * part is the slide, the thousandths are the step. Encoding them together
   * keeps the shell contract generic — it seeks a document, it does not need
   * to know what a slide is.
   */
  window.__frameSeek = function (t) {
    if (typeof t !== 'number' || !isFinite(t)) return;
    var slide = Math.floor(t);
    var built = Math.round((t - slide) * 1000);
    window.__slideShow(slide, built);
  };

  /** How many presses this slide takes — the app asks before advancing. */
  window.__slideSteps = function (i) {
    return stepsOf(slideAt(typeof i === 'number' ? i : current));
  };

  ${PICKING}

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data) return;
    if (data.type === 'pureslides:show') {
      if (typeof data.live === 'boolean') document.documentElement.setAttribute('data-live', String(data.live));
      window.__slideShow(data.slide, data.step);
    }
    if (data.type === 'pureslides:picking') {
      picking = !!data.on;
      ensureStyle();
      document.documentElement.classList.toggle('__pv-picking', picking);
      if (!picking) clearHover();
    }
    if (data.type === 'pureslides:highlight') {
      if (typeof data.scale === 'number' && data.scale > 0) scale = data.scale;
      highlight(data.paths, data.slide);
    }
  });

  stashAuthorStylesIn(deckRoot());

  apply();
  window.addEventListener('DOMContentLoaded', apply);
  // A web font landing changes every measurement, so fit again once it has.
  window.addEventListener('load', apply);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(apply).catch(function () {});
  }
  // The frame's view coming back (the tab was hidden while it measured)
  // is a reason to measure again: a hidden measurement was never trusted.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) apply();
  });
  parent.postMessage({ type: 'pureslides:ready' }, '*');
})();</script>`
}

/**
 * The print document's driver: one deck root per page, every build step
 * revealed. It calls the SAME core the board's frames call — showSlideIn,
 * applyStepsIn, fitIn — so a page is the preview at its last step, not a
 * second rendering of it. Paper has no presses, which is the only rule
 * paper adds.
 */
export function printScript(): string {
  return `<script>(function () {
  ${SEEK_CORE_FN}

  function pages() {
    return document.querySelectorAll('.pv-page[data-slide-index]');
  }

  function render() {
    var list = pages();
    var faults = 0;
    for (var p = 0; p < list.length; p++) {
      var page = list[p];
      var root = page.querySelector('[data-deck-id]') || page.querySelector('#deck');
      if (!root) continue;
      var index = parseInt(page.getAttribute('data-slide-index'), 10) || 0;
      var slide = slideIn(root, index);
      var overlaps = renderSlideIn(root, index, stepsOf(slide));
      if (overlaps.length) faults++;
      page.setAttribute('data-pv-overlaps', String(overlaps.length));
    }
    document.documentElement.setAttribute('data-pv-print-faults', String(faults));
    document.documentElement.setAttribute('data-pv-print-measured', measuredIn(list[0] ? (list[0].querySelector('[data-deck-id]') || list[0].querySelector('#deck')) : null) ? '1' : '0');
    document.documentElement.setAttribute('data-pv-print-fonts', fontsEvidence().status);
  }

  var list = pages();
  for (var p = 0; p < list.length; p++) {
    stashAuthorStylesIn(list[p].querySelector('[data-deck-id]') || list[p].querySelector('#deck'));
  }
  render();
  window.addEventListener('load', render);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(render).catch(function () {});
  }
})();</script>`
}

/**
 * Picking elements, shared with the board.
 *
 * Paths are relative to their SLIDE, and the slide is reported alongside —
 * a root-relative path carries the slide index as its first step, and every
 * consumer then has to strip it. The one that forgets addresses the wrong
 * element and looks, to the author, like a click that did nothing.
 */
const PICKING = `
  var picking = false;
  var picked = [];
  var pickedSlide = 0;
  var scale = 1;
  var STYLE_ID = '__pv_pick_style';

  function ensureStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    // Sized in the DOCUMENT's pixels: a slide is painted at a fraction of its
    // real size on the board, so a 2px outline would arrive sub-pixel.
    var w = Math.max(2, Math.round(2 / scale));
    var pad = Math.max(2, Math.round(3 / scale));
    var font = Math.max(11, Math.round(12 / scale));
    style.textContent =
      '.__pv-picked{outline:' + w + 'px solid #4f8ef7 !important;outline-offset:' + pad + 'px !important;background-color:rgba(79,142,247,.14) !important}' +
      '.__pv-hover{outline:' + w + 'px dashed rgba(79,142,247,.85) !important;outline-offset:' + pad + 'px !important}' +
      '.__pv-picking, .__pv-picking *{cursor:crosshair !important}' +
      '.__pv-tag{position:absolute;z-index:2147483647;pointer-events:none;background:#4f8ef7;color:#fff;' +
        'border-radius:' + pad + 'px;padding:' + pad + 'px ' + (pad * 2) + 'px;font-size:' + font + 'px;' +
        'font-family:ui-monospace,Menlo,monospace;line-height:1.2;white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}';
  }

  function clearHover() {
    var hovered = document.querySelectorAll('.__pv-hover');
    for (var i = 0; i < hovered.length; i++) hovered[i].classList.remove('__pv-hover');
  }

  function pathOf(node) {
    var root = deckRoot();
    var parts = [];
    var el = node && node.nodeType === 1 ? node : null;
    while (el && el !== root && el.parentElement) {
      parts.unshift(Array.prototype.indexOf.call(el.parentElement.children, el));
      el = el.parentElement;
    }
    if (el !== root || !parts.length) return null;
    if (!slideChildren().length) return { slideIndex: 0, path: parts.join('.') };
    var slideEl = root.children[parts[0]];
    var order = slideChildren().indexOf(slideEl);
    if (order < 0) return null;
    return { slideIndex: order, path: parts.slice(1).join('.') };
  }

  function elementAt(slideIndex, path) {
    var el = slideAt(slideIndex);
    if (!el) return null;
    if (path === '' || path === undefined || path === null) return el;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length && el; i++) el = el.children[Number(parts[i])];
    return el || null;
  }

  function labelFor(el) {
    if (!el) return '';
    var clone = el.cloneNode(true);
    var junk = clone.querySelectorAll ? clone.querySelectorAll('style, script, [data-notes]') : [];
    for (var i = 0; i < junk.length; i++) junk[i].remove();
    // innerHTML, not textContent: textContent butts adjacent blocks together.
    var text = (clone.innerHTML || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\\s+/g, ' ').trim();
    if (text) return text.length > 40 ? text.slice(0, 38) + '…' : text;
    return el.tagName ? el.tagName.toLowerCase() : '';
  }

  function drawTags(paths) {
    var old = document.querySelectorAll('.__pv-tag');
    for (var i = 0; i < old.length; i++) old[i].remove();
    if (!paths || !paths.length) return;
    paths.forEach(function (path) {
      var el = elementAt(pickedSlide, path);
      if (!el || !el.getBoundingClientRect) return;
      var box = el.getBoundingClientRect();
      var tag = document.createElement('div');
      tag.className = '__pv-tag';
      tag.textContent = labelFor(el);
      tag.style.left = Math.max(0, Math.round(box.left + window.scrollX)) + 'px';
      tag.style.top = Math.max(0, Math.round(box.top + window.scrollY - Math.round(26 / scale))) + 'px';
      document.body.appendChild(tag);
    });
  }

  function highlight(paths, slideIndex) {
    ensureStyle();
    picked = paths || [];
    if (typeof slideIndex === 'number') pickedSlide = slideIndex;
    var marked = document.querySelectorAll('.__pv-picked');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('__pv-picked');
    picked.forEach(function (path) {
      var el = elementAt(pickedSlide, path);
      if (el && el.classList) el.classList.add('__pv-picked');
    });
    drawTags(picked);
  }

  document.addEventListener('mouseover', function (event) {
    if (!picking) return;
    clearHover();
    if (event.target && event.target.classList) event.target.classList.add('__pv-hover');
  }, true);

  document.addEventListener('click', function (event) {
    if (!picking) return;
    var el = event.target;
    if (editing && el && (el === editing || editing.contains(el))) return;
    if (editing) commitEdit();
    event.preventDefault();
    event.stopPropagation();
    var found = pathOf(el);
    if (!found) return;
    // A second click on the picked element starts typing in the slide
    // itself — editing directly, no form in the middle. Text leaves only:
    // typing into a container would eat its elements.
    if (el && el.classList && el.classList.contains('__pv-picked') &&
        el.children.length === 0 && el.tagName !== 'IMG') {
      startEdit(el, found);
      return;
    }
    parent.postMessage({
      type: 'pureslides:picked',
      slideIndex: found.slideIndex,
      path: found.path,
      label: labelFor(el),
      additive: !!(event.shiftKey || event.metaKey || event.ctrlKey),
    }, '*');
  }, true);

  var editing = null;
  var editingFound = null;
  var editingOriginal = '';
  function serializeEdited(el) {
    var clone = el.cloneNode(true);
    clone.classList.remove('__pv-picked');
    clone.classList.remove('__pv-hover');
    if (!clone.classList.length) clone.removeAttribute('class');
    clone.removeAttribute('contenteditable');
    return clone.outerHTML;
  }
  function startEdit(el, found) {
    editing = el;
    editingFound = found;
    editingOriginal = serializeEdited(el);
    el.setAttribute('contenteditable', 'true');
    el.focus();
  }
  function commitEdit() {
    if (!editing) return;
    var el = editing;
    var found = editingFound;
    editing = null;
    editingFound = null;
    el.removeAttribute('contenteditable');
    var markup = serializeEdited(el);
    if (markup !== editingOriginal && found) {
      parent.postMessage({
        type: 'pureslides:edited',
        slideIndex: found.slideIndex,
        path: found.path,
        outerHtml: markup,
      }, '*');
    }
  }
  document.addEventListener('blur', function (event) {
    if (editing && event.target === editing) commitEdit();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && editing) {
      var el = editing;
      editing = null;
      editingFound = null;
      el.removeAttribute('contenteditable');
      var holder = document.createElement('div');
      holder.innerHTML = editingOriginal;
      if (holder.firstElementChild) el.replaceWith(holder.firstElementChild);
      event.stopPropagation();
    }
  }, true);
`

/**
 * Styles every deck gets, so a build has a default look without the author
 * writing one — and so an unrevealed element is genuinely absent from the
 * page rather than merely transparent (it must not be read aloud, tabbed to,
 * or caught by a PDF's text layer).
 */
export const BUILD_CSS = `
  [data-step] { transition: opacity 260ms ease, transform 260ms ease; }
  /* visibility, never display: an unarrived step keeps its space, so the
     slide is the same height at step 0 as at its last step. That is what
     stops a build from reflowing — and from resizing a fitted slide midway
     through presenting it. */
  [data-step].pv-out { opacity: 0; transform: translateY(10px); visibility: hidden; }
  [data-step].pv-in { opacity: 1; transform: none; visibility: visible; }
`

/** The deck HTML with the show script injected, ready to render or print. */
export function shownSlideHtml(
  html: string,
  slideIndex: number,
  step: number,
): string {
  const script = slideScript(slideIndex, step)
  const closingBody = html.lastIndexOf('</body>')
  if (closingBody !== -1) {
    return `${html.slice(0, closingBody)}${script}\n${html.slice(closingBody)}`
  }
  const closingHtml = html.lastIndexOf('</html>')
  if (closingHtml !== -1) {
    return `${html.slice(0, closingHtml)}${script}\n${html.slice(closingHtml)}`
  }
  return `${html}\n${script}\n`
}
