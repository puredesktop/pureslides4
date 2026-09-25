import { describe, expect, it } from 'vitest'
import {
  addSlide,
  clearSlides,
  deleteSlide,
  deleteSlideElement,
  duplicateSlide,
  elementAtPath,
  isUntouchedStarter,
  labelForPath,
  moveSlide,
  readElement,
  setElementSrc,
  setElementStep,
  setElementText,
  setSlideContent,
  setSlideElement,
  slidesFromHtml,
} from './slides'

const DECK = (body: string): string =>
  `<!DOCTYPE html><html><head></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">${body}</div></body></html>`

const THREE = DECK(
  '<div data-slide data-block="title"><h1>One</h1><p>First line</p></div>' +
    '<div data-slide data-block="list"><h1>Two</h1><ul><li data-step="1">a</li><li data-step="2">b</li></ul></div>' +
    '<div data-slide data-block="end"><h1>Three</h1></div>',
)

describe('reading slides', () => {
  it('reads direct children only, in order', () => {
    const slides = slidesFromHtml(THREE)
    expect(slides.map(s => s.headline)).toEqual(['One', 'Two', 'Three'])
    expect(slides[0].support).toBe('First line')
    expect(slides.map(s => s.block)).toEqual(['title', 'list', 'end'])
  })

  it('counts build steps', () => {
    const slides = slidesFromHtml(THREE)
    expect(slides.map(s => s.steps)).toEqual([0, 2, 0])
  })

  it('treats a rootful document as one synthetic slide', () => {
    const slides = slidesFromHtml(DECK('<h1>Hand written</h1>'))
    expect(slides).toHaveLength(1)
    expect(slides[0].synthetic).toBe(true)
  })

  it('reports nothing for an empty root, so the next add does not wrap nothing', () => {
    expect(slidesFromHtml(DECK(''))).toEqual([])
  })
})

describe('reordering', () => {
  it('moves a slide and leaves the rest in order', () => {
    const next = moveSlide(THREE, 0, 2)
    expect(slidesFromHtml(next).map(s => s.headline)).toEqual([
      'Two',
      'Three',
      'One',
    ])
  })

  it('is a pure reorder — nothing else is recomputed', () => {
    // Unlike a video's scenes, slides carry no start times, so a move
    // rewrites nothing but the order.
    const next = moveSlide(THREE, 2, 0)
    expect(slidesFromHtml(next).map(s => s.steps)).toEqual([0, 0, 2])
  })

  it('refuses an out-of-range move', () => {
    expect(moveSlide(THREE, 0, 9)).toBe(THREE)
  })
})

describe('adding and removing', () => {
  it('appends, and inserts at an index', () => {
    const appended = addSlide(THREE, '<div data-slide><h1>Four</h1></div>')
    expect(slidesFromHtml(appended)).toHaveLength(4)
    const inserted = addSlide(THREE, '<div data-slide><h1>Zero</h1></div>', 0)
    expect(slidesFromHtml(inserted)[0].headline).toBe('Zero')
  })

  it('wraps a rootful deck before it gains a sibling', () => {
    // Otherwise the new slide becomes a sibling of the first one's CONTENT.
    const next = addSlide(DECK('<h1>Hand written</h1>'), '<div data-slide><h1>Two</h1></div>')
    const slides = slidesFromHtml(next)
    expect(slides).toHaveLength(2)
    expect(slides[0].synthetic).toBeUndefined()
  })

  it('duplicates in place', () => {
    const next = duplicateSlide(THREE, 0)
    expect(slidesFromHtml(next).map(s => s.headline)).toEqual([
      'One',
      'One',
      'Two',
      'Three',
    ])
  })

  it('refuses to delete the last slide', () => {
    const one = DECK('<div data-slide><h1>Only</h1></div>')
    expect(deleteSlide(one, 0)).toBe(one)
    expect(slidesFromHtml(deleteSlide(THREE, 1)).map(s => s.headline)).toEqual([
      'One',
      'Three',
    ])
  })
})

describe('editing a slide', () => {
  it('sets copy without touching the markup around it', () => {
    const next = setSlideContent(THREE, 0, { headline: 'Renamed' })
    expect(slidesFromHtml(next)[0].headline).toBe('Renamed')
    expect(slidesFromHtml(next)[0].support).toBe('First line')
  })

  it('puts an asset into a video slot when the slide has no picture, and drops the cover', () => {
    const deck = THREE.replace('<h1>One</h1>', '<h1>One</h1><div><video data-video></video><div data-video-empty>Replace with a video</div></div>')
    const next = setSlideContent(deck, 0, { asset: 'assets/demo.mp4' })
    expect(next).toContain('<video data-video="" src="assets/demo.mp4">')
    expect(next).not.toContain('data-video-empty')
    expect(slidesFromHtml(next)[0].asset).toBe('assets/demo.mp4')
  })

  it('keeps notes in the slide but hidden, so they travel and never show', () => {
    const next = setSlideContent(THREE, 0, { notes: 'Pause here.' })
    expect(slidesFromHtml(next)[0].notes).toBe('Pause here.')
    expect(next).toContain('data-notes')
    expect(next).toContain('display: none')
    // Notes must not be mistaken for the slide's own copy.
    expect(slidesFromHtml(next)[0].headline).toBe('One')
  })

  it('clears notes when emptied', () => {
    const withNotes = setSlideContent(THREE, 0, { notes: 'Say this.' })
    const cleared = setSlideContent(withNotes, 0, { notes: '' })
    expect(cleared).not.toContain('data-notes')
  })
})

describe('elements inside a slide', () => {
  const DOC = DECK(
    '<div data-slide><header><h1>First</h1><p>Support</p></header><img src="a.png" /></div>',
  )

  it('addresses by the same path the preview reports', () => {
    const doc = new DOMParser().parseFromString(DOC, 'text/html')
    const slide = doc.querySelector('[data-slide]') as Element
    expect(elementAtPath(slide, '0.0')?.textContent).toBe('First')
    expect(elementAtPath(slide, '1')?.tagName).toBe('IMG')
    expect(elementAtPath(slide, '9')).toBeNull()
  })

  it('replaces and deletes one element only', () => {
    expect(setSlideElement(DOC, 0, '0.0', '<h1>Changed</h1>')).toContain('Changed')
    const deleted = deleteSlideElement(DOC, 0, '1')
    expect(deleted).not.toContain('a.png')
    expect(deleted).toContain('Support')
  })

  it('refuses a path that addresses the slide itself', () => {
    // Removing a slide is deleteSlide's job, which also refuses to empty the deck.
    expect(deleteSlideElement(DOC, 0, '')).toBe(DOC)
  })

  it('puts an element on a build step, and takes it off again', () => {
    const built = setElementStep(DOC, 0, '1', 2)
    expect(slidesFromHtml(built)[0].steps).toBe(2)
    expect(slidesFromHtml(setElementStep(built, 0, '1', 0))[0].steps).toBe(0)
  })

  it('labels an element the way the badge does', () => {
    expect(labelForPath(DOC, 0, '0.0')).toBe('First')
    expect(labelForPath(DOC, 0, '5')).toBe('5')
  })
})

describe('the starter', () => {
  it('knows a deck nobody has written yet, and can clear it', () => {
    const starter = DECK('<div data-slide data-block="starter"><h1>Untitled deck</h1></div>')
    expect(isUntouchedStarter(starter)).toBe(true)
    expect(isUntouchedStarter(THREE)).toBe(false)
    expect(slidesFromHtml(clearSlides(starter))).toEqual([])
  })
})

describe('dropping a dragged slide', () => {
  // The strip reports a GAP (0 = above the first, n = below the last), but
  // moveSlide takes an index into the list with the dragged slide already
  // removed. Getting this wrong lands the slide one place short, every time,
  // and only when dragging downward — so it is worth pinning down.
  const dropAt = (gap: number, from: number): number => (gap > from ? gap - 1 : gap)
  const FOUR = DECK(
    '<div data-slide><h1>A</h1></div><div data-slide><h1>B</h1></div>' +
      '<div data-slide><h1>C</h1></div><div data-slide><h1>D</h1></div>',
  )
  const order = (html: string): string[] =>
    slidesFromHtml(html).map(slide => slide.headline)

  it('drags the first slide into the middle', () => {
    // A dropped into the gap above C (gap 2)
    expect(order(moveSlide(FOUR, 0, dropAt(2, 0)))).toEqual(['B', 'A', 'C', 'D'])
  })

  it('drags a late slide upward', () => {
    // D dropped into the gap above B (gap 1)
    expect(order(moveSlide(FOUR, 3, dropAt(1, 3)))).toEqual(['A', 'D', 'B', 'C'])
  })

  it('drags a slide to the very end', () => {
    // A dropped below the last card (gap 4)
    expect(order(moveSlide(FOUR, 0, dropAt(4, 0)))).toEqual(['B', 'C', 'D', 'A'])
  })

  it('drags a slide to the very top', () => {
    expect(order(moveSlide(FOUR, 2, dropAt(0, 2)))).toEqual(['C', 'A', 'B', 'D'])
  })

  it('leaves the order alone when dropped where it already is', () => {
    expect(dropAt(1, 1)).toBe(1)
    expect(dropAt(2, 1)).toBe(1)
  })
})

describe('editing a picked element directly', () => {
  const DOC = DECK(
    '<div data-slide><h1>Headline</h1><div><p>Nested</p></div><img src="a.png" /></div>',
  )

  it('reads what an element is, so the rail can offer the right control', () => {
    expect(readElement(DOC, 0, '0')).toMatchObject({
      tag: 'h1',
      text: 'Headline',
      editableText: true,
      isImage: false,
    })
    expect(readElement(DOC, 0, '2')).toMatchObject({
      tag: 'img',
      src: 'a.png',
      isImage: true,
      editableText: false,
    })
  })

  it('refuses to call a container editable', () => {
    // Writing a string into a div holding a <p> would delete the <p>.
    expect(readElement(DOC, 0, '1')?.editableText).toBe(false)
    expect(setElementText(DOC, 0, '1', 'oops')).toBe(DOC)
  })

  it('retypes a leaf without disturbing its markup', () => {
    const next = setElementText(DOC, 0, '0', 'Rewritten')
    expect(next).toContain('<h1>Rewritten</h1>')
    expect(next).toContain('a.png')
  })

  it('points an image somewhere else', () => {
    const next = setElementSrc(DOC, 0, '2', 'assets/shot.png')
    expect(next).toContain('assets/shot.png')
    expect(next).not.toContain('"a.png"')
  })

  it('fills a placeholder box, keeping the box', () => {
    // A placeholder is a styled div, not an <img>. Replacing it outright
    // would drop its size, radius and place in the layout.
    const box = DECK(
      '<div data-slide><div style="border-radius: 12px">Replace with an image</div></div>',
    )
    const next = setElementSrc(box, 0, '0', 'assets/shot.png')
    expect(next).toContain('border-radius: 12px')
    expect(next).toContain('<img src="assets/shot.png"')
    expect(next).not.toContain('Replace with an image')
  })
})
