/**
 * Measure every slide now, in a frame that is on screen but invisible.
 *
 * The board's frames measure as they render, but they only exist for what
 * is on screen: the Files pane up, a hidden tab, a font still loading —
 * each leaves slides `checking`. Export cannot wait for the strip, so it
 * asks for the whole deck to be measured here: one frame, the same seek
 * script the board runs, driven slide by slide, read back directly.
 *
 * The kit's frame answers `dead` instead of zeros when it has no geometry,
 * and its fonts are awaited before anything is read; a frame that still
 * has not loaded its fonts reports `loading`, which the verifier never
 * trusts.
 */
import {
  afterLayout,
  fontsSignature,
  fontsStatusOf,
  mountMeasuringFrame,
} from '@purescience/platform-ui/editing'
import { hashDeck } from './deckDoor'
import { slideFingerprint, type SlideEvidence } from './deckVerification'
import { shownSlideHtml } from './slideSeek'
import type { DeckGeometry } from './deckDocument'
import type { Slide } from './slides'

type SeekWindow = Window & {
  __slideShow?: (slide: number, step: number) => void
}

/**
 * Evidence for every slide, keyed by index; `null` when no frame could be
 * mounted at all (the render is then left `checking`, never trusted).
 */
export async function measureDeck(
  html: string,
  slides: Slide[],
  geometry: DeckGeometry,
  /**
   * The document as the board shows it — package assets inlined — when
   * that differs from `html`. The evidence is pinned to `html`'s hash; the
   * frame lays out what the board lays out, pictures and clips included.
   */
  viewHtml: string = html,
): Promise<Record<number, SlideEvidence> | null> {
  const mounted = await mountMeasuringFrame(shownSlideHtml(viewHtml, 0, 0), {
    // Scripts ON, because the fit IS a script; same-origin so the result is
    // read straight off the frame's DOM. The document is the author's own
    // deck, the same one the board already runs with scripts allowed.
    sandbox: 'allow-same-origin allow-scripts',
    width: geometry.width,
    height: geometry.height,
  })
  if (!mounted.ok) return null
  const { frame } = mounted
  try {
    await afterLayout(frame.document)
    const doc = frame.document
    const win = frame.window as SeekWindow
    const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    if (!root || typeof win.__slideShow !== 'function') return null
    const hash = hashDeck(html)
    const fontsStatus = fontsStatusOf(doc)
    const signature = fontsSignature(doc)
    const fingerprint = slideFingerprint(geometry, signature)
    const evidence: Record<number, SlideEvidence> = {}
    for (const slide of slides) {
      win.__slideShow(slide.index, slide.steps)
      const read = frame.measure(() => {
        const children = [...root.children].filter(child => child.matches('[data-slide]'))
        const element = children.length ? children[slide.index] : root
        return Number(element?.getAttribute('data-pv-overlaps') ?? 0) || 0
      }, root)
      evidence[slide.index] = {
        hash,
        measured: read.ok && !doc.hidden,
        fontsStatus,
        fontsSignature: signature,
        overlaps: read.ok ? read.value : 0,
        fingerprint,
      }
    }
    return evidence
  } finally {
    frame.dispose()
  }
}
