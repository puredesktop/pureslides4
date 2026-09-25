/**
 * The still that stands for a deck in a list.
 *
 * Two things make this awkward, and both shape the result:
 *
 * 1. The switcher renders previews with scripts OFF, so the seek script
 *    cannot run. Clips would not honour their windows and every slide would
 *    stack on the first. So the cover is built statically: keep the opening
 *    slide, drop the rest, and take animations off so elements settle.
 * 2. A deck is a FIXED canvas — 1920×1080 — dropped into a card a few
 *    hundred pixels wide. Left alone it renders at full size and you see its
 *    top-left corner. Scaling to fit normally needs JavaScript, so instead the
 *    canvas rides inside an SVG `viewBox`, which scales its contents to
 *    whatever box it is given.
 */
import { DEFAULT_HEIGHT, DEFAULT_WIDTH } from '../constants'

/**
 * Run every animation to its end, instantly.
 *
 * `animation: none` looks like the obvious move and is the wrong one: it
 * reverts each element to its pre-animation style, so a slide built out of
 * fade-ups — most of them — settles at opacity 0 and the cover comes out
 * black. Collapsing the duration instead, with fill mode `both`, lands on the
 * final frame, which is what the slide actually looks like.
 */
const SETTLE_CSS = `
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    animation-fill-mode: both !important;
    animation-play-state: running !important;
    transition: none !important;
  }
`

/**
 * Fit by the deck's own shape, not the frame's.
 *
 * The preview frame is whatever the switcher makes it — sometimes taller than
 * wide — so sizing the canvas to the frame lets its shape decide what shows.
 * Pinning the aspect ratio and centring keeps the whole opening slide visible
 * in any box.
 */
function fitCss(width: number, height: number): string {
  return `
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  /*
   * Top, not centre. The preview frame is often taller than the card that
   * shows it, so a vertically centred deck is centred in a box whose
   * bottom half is never painted — which reads as a picture sunk to the
   * bottom of the card. Anchoring to the top puts it where the card looks.
   */
  body { display: flex; align-items: flex-start; justify-content: center; }
  svg.pv-fit {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: ${width} / ${height};
  }
`
}

function readNumber(
  element: Element | null,
  name: string,
  fallback: number,
): number {
  const value = Number(element?.getAttribute(name))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function coverHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root =
    doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html

  // Only the opening slide: a cover shows where the deck opens.
  const slides = [...root.children].filter(child =>
    child.matches('[data-slide]'),
  )
  slides.slice(1).forEach(slide => slide.remove())

  const width = readNumber(root, 'data-width', DEFAULT_WIDTH)
  const height = readNumber(root, 'data-height', DEFAULT_HEIGHT)

  // Whatever the document's own <head> holds still styles the deck.
  const headStyles = [...doc.querySelectorAll('head style, head link')]
    .map(node => node.outerHTML)
    .join('\n')

  const rootMarkup = root.outerHTML

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
${headStyles}
    <style>${fitCss(width, height)}${SETTLE_CSS}</style>
  </head>
  <body>
    <svg class="pv-fit" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <foreignObject x="0" y="0" width="${width}" height="${height}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px; position: relative; overflow: hidden">
${rootMarkup}
        </div>
      </foreignObject>
    </svg>
  </body>
</html>
`
}
