import { describe, expect, it } from 'vitest'
import { SLIDE_BLOCKS, blockCatalogue, blockHtmlWith, findBlock } from './blocks'
import { addSlide, slidesFromHtml } from './slides'
import { checkDeck, hasBlockingFinding } from './checkDeck'

const EMPTY = `<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720"></div></body></html>`

describe('the block catalogue', () => {
  it('offers a real range of compositions, not variations of one', () => {
    expect(SLIDE_BLOCKS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(SLIDE_BLOCKS.map(b => b.id)).size).toBe(SLIDE_BLOCKS.length)
  })

  it('every block is a slide the deck can actually hold', () => {
    for (const block of SLIDE_BLOCKS) {
      const deck = addSlide(EMPTY, block.html)
      const slides = slidesFromHtml(deck)
      expect(slides, block.id).toHaveLength(1)
      // A block whose headline is not an <h1> cannot be edited from the rail.
      expect(slides[0].headline, block.id).not.toBe('')
      expect(hasBlockingFinding(checkDeck(deck)), block.id).toBe(false)
    }
  })

  it('declares its build steps honestly', () => {
    for (const block of SLIDE_BLOCKS) {
      const slides = slidesFromHtml(addSlide(EMPTY, block.html))
      expect(slides[0].steps, block.id).toBe(block.steps)
    }
  })

  it('numbers build steps from 1 with no gaps', () => {
    // A gap is a press that does nothing — checkDeck warns, but a shipped
    // block should never trip it.
    for (const block of SLIDE_BLOCKS) {
      const findings = checkDeck(addSlide(EMPTY, block.html))
      expect(findings.filter(f => f.code === 'step-gap'), block.id).toEqual([])
    }
  })

  it('finds one by id, and says no to an id it does not have', () => {
    expect(findBlock('quote')?.label).toBe('Quote')
    expect(findBlock('nope')).toBeUndefined()
    expect(blockCatalogue()).toHaveLength(SLIDE_BLOCKS.length)
  })
})

describe('video blocks', () => {
  it('offers a clip edge to edge and a clip in a frame, marked as video slots', () => {
    const video = blockCatalogue().filter(block => block.media === 'video').map(block => block.id)
    expect(video).toEqual(['video-full', 'video'])
  })

  it('fills the slot with the clip and drops the cover; without a clip the cover stays', () => {
    const block = findBlock('video')!
    const filled = blockHtmlWith(block, { asset: 'demo.mp4' })
    expect(filled).toContain('src="assets/demo.mp4"')
    expect(filled).not.toContain('data-video-empty')
    expect(filled).toContain('data-video')
    expect(blockHtmlWith(block)).toContain('data-video-empty')
    expect(blockHtmlWith(findBlock('title')!, { asset: 'demo.mp4' })).toBe(findBlock('title')!.html)
  })

  it('a filled video block is a slide the deck holds and checks warn-free', () => {
    const deck = addSlide(EMPTY, blockHtmlWith(findBlock('video-full')!, { asset: 'demo.mp4' }))
    expect(slidesFromHtml(deck)).toHaveLength(1)
    expect(checkDeck(deck).filter(finding => finding.code.startsWith('video'))).toEqual([])
  })
})
