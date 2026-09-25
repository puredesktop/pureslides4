import { describe, expect, it } from 'vitest'
import { parseDraft } from './draftDeck'

describe('parseDraft', () => {
  it('reads the object shape it asks for', () => {
    const draft = parseDraft(
      '{"title":"Teams brief","slides":[{"block":"title","notes":"pause","html":"<div data-slide><h1>Hi</h1></div>"}]}',
    )
    expect(draft.title).toBe('Teams brief')
    expect(draft.slides).toHaveLength(1)
    expect(draft.slides[0].notes).toBe('pause')
  })

  it('accepts a bare array, which a model returns anyway', () => {
    const draft = parseDraft('[{"html":"<div data-slide><h1>Hi</h1></div>"}]')
    expect(draft.title).toBe('')
    expect(draft.slides).toHaveLength(1)
  })

  it('reads through a fenced block and drops entries with no markup', () => {
    const draft = parseDraft(
      '```json\n{"title":"X","slides":[{"html":"not markup"},{"html":"<div data-slide></div>"}]}\n```',
    )
    expect(draft.slides).toHaveLength(1)
  })

  it('returns nothing usable rather than throwing on junk', () => {
    expect(parseDraft('sorry, I cannot').slides).toEqual([])
    expect(parseDraft('{ broken').slides).toEqual([])
  })
})

describe('a response that was cut off', () => {
  it('keeps the slides that arrived whole', () => {
    // The model ran out of room midway through the third slide. The first two
    // are complete and there is no reason to lose them with the third.
    const truncated = `{"title":"Ship it","slides":[
      {"block":"title","notes":"open","html":"<div data-slide><h1>One</h1></div>"},
      {"block":"points","notes":"","html":"<div data-slide><h1>Two</h1></div>"},
      {"block":"cards","notes":"","html":"<div data-slide><h1>Thr`
    const parsed = parseDraft(truncated)
    expect(parsed.slides).toHaveLength(2)
    expect(parsed.slides[0].block).toBe('title')
    expect(parsed.slides[1].html).toContain('Two')
  })

  it('is not fooled by a brace inside a style attribute', () => {
    const tricky = `[{"block":"a","notes":"","html":"<div data-slide style=\\"font-family: 'X{Y}'\\"><h1>Ok</h1></div>"},{"block":"b`
    const parsed = parseDraft(tricky)
    expect(parsed.slides).toHaveLength(1)
    expect(parsed.slides[0].html).toContain('Ok')
  })
})
