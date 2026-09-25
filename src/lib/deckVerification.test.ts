import { describe, expect, it } from 'vitest'
import {
  evidenceFrom,
  exportFailedWords,
  layoutReportFrom,
  slideFingerprint,
  verifyDeck,
  verifySlide,
  type SlideEvidence,
} from './deckVerification'

const geometry = { width: 1280, height: 720, deckId: 'deck' }
const hash = 'abc123abc123abc1'

function clean(overrides: Partial<SlideEvidence> = {}): SlideEvidence {
  const base = evidenceFrom(
    { step: 0, overlaps: 0, measured: true, fontsStatus: 'loaded', fontsSignature: 'Archivo/400/normal' },
    hash,
    geometry,
  )
  return { ...base, ...overrides }
}

describe('verifySlide', () => {
  it('is verified only for a clean measurement in a live frame with loaded fonts', () => {
    expect(verifySlide(clean(), hash, geometry).state).toBe('verified')
  })

  it('is never verified from a hidden or dead frame', () => {
    const result = verifySlide(clean({ measured: false }), hash, geometry)
    expect(result.state).toBe('checking')
    expect(result.reasons).toContain('hidden-frame')
  })

  it('is never verified while fonts are loading — even with no overlaps', () => {
    const result = verifySlide(clean({ fontsStatus: 'loading' }), hash, geometry)
    expect(result.state).toBe('checking')
    expect(result.reasons).toContain('fonts-loading')
  })

  it('is checking when the html changed since the frame measured', () => {
    const result = verifySlide(clean(), 'ffffffffffffffff', geometry)
    expect(result.state).toBe('checking')
    expect(result.reasons).toContain('stale-content')
  })

  it('is checking when the frame box changed since the frame measured', () => {
    const result = verifySlide(clean(), hash, { ...geometry, width: 1920, height: 1080 })
    expect(result.state).toBe('checking')
    expect(result.reasons).toContain('stale-fingerprint')
  })

  it('fails only a clean measurement whose content overlaps', () => {
    expect(verifySlide(clean({ overlaps: 2 }), hash, geometry).state).toBe('failed')
    // Overlaps measured in a dead frame mean nothing either way.
    expect(verifySlide(clean({ overlaps: 2, measured: false }), hash, geometry).state).toBe('checking')
  })

  it('is checking for a slide nobody has measured', () => {
    expect(verifySlide(undefined, hash, geometry).state).toBe('checking')
  })
})

describe('verifyDeck', () => {
  it('is verified only when every slide is', () => {
    const deck = verifyDeck(3, { 0: clean(), 1: clean(), 2: clean() }, hash, geometry)
    expect(deck.state).toBe('verified')
    expect(deck.message).toBe('Layout checked')
  })

  it('is being checked while any slide is unmeasured', () => {
    const deck = verifyDeck(3, { 0: clean(), 2: clean() }, hash, geometry)
    expect(deck.state).toBe('checking')
    expect(deck.checkingSlides).toEqual([2])
    expect(deck.message).toBe('Layout being checked')
  })

  it('names the slides whose text overlaps, in people words', () => {
    const one = verifyDeck(3, { 0: clean(), 1: clean({ overlaps: 1 }), 2: clean() }, hash, geometry)
    expect(one.state).toBe('failed')
    expect(one.failedSlides).toEqual([2])
    expect(one.message).toBe('Slide 2 has overlapping text')
    const two = verifyDeck(4, { 0: clean(), 1: clean({ overlaps: 1 }), 2: clean(), 3: clean({ overlaps: 3 }) }, hash, geometry)
    expect(two.message).toBe('Slides 2, 4 have overlapping text')
    expect(exportFailedWords(two)).toMatch(/Slides 2, 4 have overlapping text/)
    expect(exportFailedWords(two)).toMatch(/export again/)
  })

  it('keeps checking ahead of failed — a hidden measurement cannot condemn a slide', () => {
    const deck = verifyDeck(2, { 0: clean({ overlaps: 1 }), 1: clean({ measured: false }) }, hash, geometry)
    expect(deck.state).toBe('checking')
    expect(deck.failedSlides).toEqual([1])
  })
})

describe('the frame’s report', () => {
  it('pins a report to the html and the frame box it was measured under', () => {
    const evidence = evidenceFrom(
      { step: 0, overlaps: 0, measured: true, fontsStatus: 'loaded', fontsSignature: 'A/400/normal' },
      hash,
      geometry,
    )
    expect(evidence.fingerprint).toBe(slideFingerprint(geometry, 'A/400/normal'))
    expect(evidence.fingerprint).toContain('frame:1280x720')
    expect(evidence.fingerprint).toContain('A/400/normal')
    expect(evidence.fingerprint).toMatch(/\|eseek-/)
  })

  it('reads an older frame’s message as unmeasured with loading fonts', () => {
    const report = layoutReportFrom({ overlaps: [] })
    expect(report).toEqual({ step: 0, overlaps: 0, measured: false, fontsStatus: 'loading', fontsSignature: '' })
    expect(layoutReportFrom({ step: 2, overlaps: [{}, {}], measured: true, fonts: 'loaded', fontsSignature: 'x' })).toEqual({
      step: 2,
      overlaps: 2,
      measured: true,
      fontsStatus: 'loaded',
      fontsSignature: 'x',
    })
  })
})
