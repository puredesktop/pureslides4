import { describe, expect, it } from 'vitest'
import { coverHtml } from './cover'

const DECK = `<!DOCTYPE html><html><head><style>h1 { animation: rise 1s both }</style></head><body>
  <div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
    <div data-slide><h1>Opening</h1></div>
    <div data-slide><h1>Second</h1></div>
  </div>
</body></html>`

describe('coverHtml', () => {
  it('keeps the opening slide and drops the rest', () => {
    const cover = coverHtml(DECK)
    expect(cover).toContain('Opening')
    expect(cover).not.toContain('Second')
  })

  it('settles animations onto their FINAL frame, not their first', () => {
    // Turning animations off leaves a fade-up at opacity 0 — a black cover
    // for most slides ever written.
    const cover = coverHtml(DECK)
    expect(cover).toContain('animation-duration: 1ms !important')
    expect(cover).toContain('animation-fill-mode: both !important')
    expect(cover).not.toContain('animation: none')
  })

  it('scales to whatever box it is given, without scripts', () => {
    // The switcher renders previews with scripts off, so fitting cannot use
    // JavaScript; an SVG viewBox scales its contents to any frame.
    const cover = coverHtml(DECK)
    expect(cover).toContain('viewBox="0 0 1280 720"')
    expect(cover).toContain('<foreignObject')
  })

  it('fits by the deck shape, not the frame it lands in', () => {
    expect(coverHtml(DECK)).toContain('aspect-ratio: 1280 / 720')
  })
})
