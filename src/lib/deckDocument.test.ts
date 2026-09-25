import { describe, expect, it } from 'vitest'
import {
  deckSeconds,
  parsePackageManifest,
  serializePackageManifest,
} from './deckDocument'
import { DEFAULT_SLIDE_SECONDS } from '../constants'

describe('the manifest carries the wizard answers', () => {
  it('round-trips look and slideCount beside the brief', () => {
    const manifest = parsePackageManifest(
      serializePackageManifest({
        title: 'Launch',
        brief: 'For the board.',
        look: 'ink',
        slideCount: 12,
      }),
    )
    expect(manifest.look).toBe('ink')
    expect(manifest.slideCount).toBe(12)
    expect(manifest.brief).toBe('For the board.')
  })

  it('leaves them out of a manifest that never stored them', () => {
    // Opening such a deck must reset the wizard to defaults, so the parse
    // reports absence rather than inventing values.
    const manifest = parsePackageManifest('{"title":"Old deck"}')
    expect(manifest.look).toBeUndefined()
    expect(manifest.slideCount).toBeUndefined()
  })

  it('drops a slideCount that is not a positive number', () => {
    expect(
      parsePackageManifest('{"title":"x","slideCount":-3}').slideCount,
    ).toBeUndefined()
    expect(
      parsePackageManifest('{"title":"x","slideCount":"eight"}').slideCount,
    ).toBeUndefined()
  })
})

describe('deckSeconds', () => {
  it('sums each slide’s hold', () => {
    expect(deckSeconds([2, 3, 5])).toBe(10)
  })

  it('substitutes the default for a slide with no usable hold', () => {
    expect(deckSeconds([2, 0])).toBe(2 + DEFAULT_SLIDE_SECONDS)
  })
})
