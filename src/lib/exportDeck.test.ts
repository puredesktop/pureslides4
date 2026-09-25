import { describe, expect, it } from 'vitest'
import {
  ExportRefused,
  assertDeckExportable,
  countPdfSheets,
  createCaptureProgress,
  deckFrameKeep,
  deckFrameSize,
  expectedSheets,
  exportDeck,
  fileStem,
  frameFileName,
  printableHtml,
  videoTimeline,
} from './exportDeck'
import { SEEK_CORE_FN, shownSlideHtml } from './slideSeek'
import { slidesFromHtml } from './slides'

const DECK = `<!DOCTYPE html><html><head><style>h1{color:#111}</style></head><body>
  <div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
    <div data-slide><h1>One</h1><div data-notes hidden>say this</div></div>
    <div data-slide><h1>Two</h1><p data-step="1" class="pv-out">later</p></div>
  </div></body></html>`

describe('printableHtml', () => {
  it('gives each slide its own page at the deck size', () => {
    const print = printableHtml(DECK)
    expect(print).toContain('size: 1280px 720px')
    expect((print.match(/class="pv-page" data-slide-index=/g) ?? []).length).toBe(2)
  })

  it('keeps speaker notes hidden the way the markup hides them — nothing is stripped', () => {
    const print = printableHtml(DECK)
    expect(print).toContain('data-notes="" hidden=""')
  })

  it('prints a video as its poster, or as a panel that says what would play there', () => {
    const deck = DECK.replace(
      '<h1>One</h1>',
      '<h1>One</h1><video src="assets/demo.mp4" style="position: absolute; inset: 0; width: 100%; height: 100%"></video><video src="assets/b.mp4" poster="assets/b.jpg" class="clip"></video>',
    )
    const print = printableHtml(deck)
    expect(print).not.toContain('<video')
    expect(print).toContain('data-video-placeholder=""')
    expect(print).toContain('Video · demo.mp4')
    expect(print).toContain('position: absolute; inset: 0; width: 100%; height: 100%; display: grid')
    expect(print).toContain('<div data-video-placeholder="" class="clip"><img src="assets/b.jpg"')
  })

  it('carries the deck’s own styles across', () => {
    expect(printableHtml(DECK)).toContain('h1{color:#111}')
  })

  it('adds the notes appendix only when asked', () => {
    expect(printableHtml(DECK, { notes: ['say this', ''] })).not.toContain('Speaker notes')
    const withNotes = printableHtml(DECK, { notesAppendix: true, notes: ['say this', ''] })
    expect(withNotes).toContain('Speaker notes')
    expect(withNotes).toContain('<li>say this</li>')
  })

  it('fingerprints the print render with the content hash and the print engine', () => {
    const print = printableHtml(DECK)
    expect(print).toMatch(/data-print-fingerprint="[0-9a-f]{16}\|1280x720\|\|dpr1\|eseek-\d+\/print-\d+"/)
  })
})

/**
 * The PDF is the preview: same markup, same seek core, no print-only
 * override of what a slide shows. These are the structural halves of the
 * parity the live harness (scripts/print-parity.mjs) proves per sheet.
 */
describe('print parity with the preview', () => {
  const print = printableHtml(DECK)
  const doc = new DOMParser().parseFromString(print, 'text/html')
  const pages = [...doc.querySelectorAll('.pv-page[data-slide-index]')]

  it('puts the deck root on every page exactly as the board renders it', () => {
    const source = new DOMParser().parseFromString(DECK, 'text/html').querySelector('#deck')
    expect(pages).toHaveLength(2)
    for (const page of pages) {
      const root = page.querySelector('[data-deck-id]')
      expect(root?.outerHTML).toBe(source?.outerHTML)
    }
  })

  it('drives the pages with the SAME core the preview frames run', () => {
    const preview = shownSlideHtml(DECK, 1, 1)
    expect(preview).toContain(SEEK_CORE_FN)
    expect(print).toContain(SEEK_CORE_FN)
    // The print driver reveals every step through the shared applyStepsIn,
    // not through a CSS override — there is no second rule for a build.
    expect(print).not.toMatch(/\[data-step\][^{]*\{[^}]*!important/)
    expect(print).toContain('renderSlideIn(root, index, stepsOf(slide))')
  })

  it('injects nothing into the slide that the preview would not', () => {
    expect(print).not.toContain('.pv-page > [data-slide]')
    expect(print).not.toContain('position: absolute; inset: 0 }')
  })

  it('keeps a scaled slide on one sheet: the page root is size-contained, and that is the only print-only rule', () => {
    // A printer fragments by layout position; a fitted slide is laid out
    // taller than the frame. Without this the tail of the slide is cut from
    // the sheet (scripts/print-parity.mjs, slide 4).
    expect(print).toContain('.pv-page > [data-deck-id] { contain: size; }')
    const scaffoldStyle = print.slice(print.lastIndexOf('<style>'), print.lastIndexOf('</style>'))
    const rules = scaffoldStyle.match(/[^{}]+\{/g)?.map(rule => rule.replace(/\/\*[\s\S]*?\*\//g, '').trim()) ?? []
    expect(rules.filter(rule => rule.includes('[data-deck-id]') || rule.includes('[data-slide]') || rule.includes('[data-step]'))).toEqual([
      '.pv-page > [data-deck-id] {',
    ])
  })
})

describe('the export guard in the pipeline', () => {
  const verify = (state: 'verified' | 'checking' | 'failed', recheck = async () => undefined) => ({
    state: () => state,
    recheck,
    failedMessage: () => 'Slide 2 has overlapping text — export not run.',
  })

  it('refuses a deck that is still being checked, after re-checking once', async () => {
    let rechecked = 0
    const refusal = await assertDeckExportable(
      DECK,
      verify('checking', async () => {
        rechecked += 1
      }),
    ).catch(error => error)
    expect(refusal).toBeInstanceOf(ExportRefused)
    expect(refusal.reason).toBe('checking')
    expect(refusal.message).toMatch(/still being checked/)
    expect(rechecked).toBe(1)
  })

  it('refuses a failed layout with the slide named', async () => {
    const refusal = await assertDeckExportable(DECK, verify('failed')).catch(error => error)
    expect(refusal).toBeInstanceOf(ExportRefused)
    expect(refusal.reason).toBe('failed')
    expect(refusal.message).toMatch(/Slide 2/)
  })

  it('refuses a deck the static check blocks, before anything is written', async () => {
    const refusal = await assertDeckExportable('<html><body>no root</body></html>', verify('verified')).catch(error => error)
    expect(refusal).toBeInstanceOf(ExportRefused)
    expect(refusal.reason).toBe('blocked')
  })

  it('lets a verified deck through without a re-check', async () => {
    let rechecked = 0
    await assertDeckExportable(
      DECK,
      verify('verified', async () => {
        rechecked += 1
      }),
    )
    expect(rechecked).toBe(0)
  })

  it('is the pipeline’s own gate — exportDeck itself refuses, whoever calls it', async () => {
    const refusal = await exportDeck({
      html: DECK,
      slides: slidesFromHtml(DECK),
      documentPath: '/tmp/never-written.deck',
      title: 'Never',
      kind: 'pdf',
      verify: verify('checking'),
    }).catch(error => error)
    expect(refusal).toBeInstanceOf(ExportRefused)
  })

  it('becomes verified after the re-check and proceeds to the export', async () => {
    let state: 'checking' | 'verified' = 'checking'
    await assertDeckExportable(DECK, {
      state: () => state,
      recheck: async () => {
        state = 'verified'
      },
      failedMessage: () => '',
    })
  })
})

describe('sheet count', () => {
  it('expects one sheet per slide plus the appendix when notes are on', () => {
    const slides = slidesFromHtml(DECK)
    expect(expectedSheets(slides)).toBe(2)
    expect(expectedSheets(slides, { notesAppendix: true })).toBe(3)
    expect(expectedSheets(slides.map(slide => ({ ...slide, notes: '' })), { notesAppendix: true })).toBe(2)
  })

  it('counts page objects in a PDF and not the page tree', () => {
    const pdf = '%PDF-1.4 1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] >> 2 0 obj << /Type /Page >> 3 0 obj << /Type /Page >>'
    expect(countPdfSheets(pdf)).toBe(2)
  })
})

describe('videoTimeline', () => {
  it('holds each slide for its seconds', () => {
    const slides = slidesFromHtml(DECK).map(slide => ({ ...slide, seconds: 2 }))
    const frames = videoTimeline(slides, 10)
    expect(frames).toHaveLength(40)
    expect(frames[0].slide).toBe(0)
    expect(frames[39].slide).toBe(1)
  })

  it('spreads a slide’s build steps across its hold', () => {
    const slides = slidesFromHtml(DECK).map(slide => ({ ...slide, seconds: 2 }))
    const second = videoTimeline(slides, 10).filter(frame => frame.slide === 1)
    expect(second[0].step).toBe(0)
    expect(second[second.length - 1].step).toBe(1)
  })
})

describe('fileStem', () => {
  it('names the output from the deck title', () => {
    // Stemming from the global document.title named every deck's export
    // the same, since nothing ever set it.
    expect(fileStem('Q3 Review — Board!')).toBe('q3-review-board')
  })

  it('falls back when the title has nothing usable', () => {
    expect(fileStem('')).toBe('deck')
    expect(fileStem('!!!')).toBe('deck')
  })
})

describe('frameFileName', () => {
  it('matches the shell’s zero-padded {i} substitution', () => {
    expect(frameFileName(0)).toBe('frame-00000.png')
    expect(frameFileName(42)).toBe('frame-00042.png')
  })
})

describe('createCaptureProgress', () => {
  it('counts from the position the shell reports', () => {
    const fold = createCaptureProgress(100)
    expect(fold({ pct: 0.42 })?.unit).toBe(42)
  })

  it('leaves the count alone for an event with no position', () => {
    // Reading `pct ?? 0` here reported unit 0, so the count snapped back to
    // the start between real ones and the export looked stalled.
    const fold = createCaptureProgress(100)
    fold({ pct: 0.5 })
    expect(fold({ message: 'Writing' })).toEqual({ unit: 50, message: 'Writing' })
    expect(fold({})).toBeNull()
  })

  it('never goes backwards', () => {
    const fold = createCaptureProgress(100)
    expect(fold({ pct: 0.6 })?.unit).toBe(60)
    expect(fold({ pct: 0.1 })?.unit).toBe(60)
  })
})

describe('the print path fits like the screen does', () => {
  it('carries the same fit pass the frames run', () => {
    // Without this the PDF crops a slide that fits on screen, and the two
    // disagree about what the deck says.
    const print = printableHtml(DECK)
    expect(print).toContain("px) scale(' + scale + ')")
    expect(print).toContain('document.fonts')
  })

  it('measures against the deck root on the page, exactly as the frames do', () => {
    const print = printableHtml(DECK)
    expect(print).toContain("root.clientWidth || parseFloat(root.getAttribute('data-width'))")
    expect(print).not.toContain('page.clientWidth')
  })
})

describe('captured frames are cut to the deck', () => {
  it('keeps the deck aspect at the frame width, whatever height the renderer used', () => {
    expect(deckFrameSize({ width: 2560, height: 1800 }, { width: 1280, height: 720 })).toEqual({ width: 2560, height: 1440 })
    expect(deckFrameKeep({ width: 2560, height: 1800 }, { width: 1280, height: 720 })).toBe(0.8)
    // A frame already at the deck's aspect is kept whole.
    expect(deckFrameKeep({ width: 1280, height: 720 }, { width: 1280, height: 720 })).toBe(1)
    // Never taller than what was captured.
    expect(deckFrameSize({ width: 1280, height: 720 }, { width: 1024, height: 768 })).toEqual({ width: 1280, height: 720 })
  })
})
