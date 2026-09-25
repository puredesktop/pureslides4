import { describe, expect, it } from 'vitest'
import {
  deinlineAssetUrls,
  inlineAssetUrls,
  picturesOnly,
  previewCapFor,
  referencedAssetNames,
  resolvePreviewAssets,
} from './packageAssets'

const HTML = `<div data-slide><img src="assets/logo.png"><video src="assets/demo.mp4" poster="assets/still.jpg"></video><div style="background: url(assets/bg.png)"></div><img src="assets/logo.png"></div>`

describe('package assets in the preview', () => {
  it('lists every referenced asset once, src, poster and url() alike', () => {
    expect(referencedAssetNames(HTML)).toEqual(['logo.png', 'demo.mp4', 'still.jpg', 'bg.png'])
  })

  it('gives videos a larger cap than pictures', () => {
    expect(previewCapFor('demo.mp4')).toBeGreaterThan(previewCapFor('logo.png'))
  })

  it('inlines what it has and leaves the rest as written', () => {
    const out = inlineAssetUrls(HTML, { 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB' })
    expect(out).toContain('src="data:image/png;base64,AA"')
    expect(out).toContain('<video src="data:video/mp4;base64,BB" poster="assets/still.jpg">')
    expect(out).toContain('url(assets/bg.png)')
  })

  it('maps the data URLs back to package paths before anything is written', () => {
    const previews = { 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB' }
    const back = deinlineAssetUrls(inlineAssetUrls(HTML, previews), previews)
    expect(back.html).toBe(HTML)
    expect(back.restored.sort()).toEqual(['demo.mp4', 'logo.png'])
    expect(back.unknownDataUrls).toBe(0)
  })

  it('resolves from disk with the cap by kind, reporting what it skipped', async () => {
    const sizes: Record<string, number | null> = { 'logo.png': 100, 'demo.mp4': 500 * 1024 * 1024, 'still.jpg': null, 'bg.png': 10 }
    const reads: string[] = []
    const result = await resolvePreviewAssets(HTML, {
      sizeOf: async name => sizes[name] ?? null,
      read: async name => {
        reads.push(name)
        if (name === 'bg.png') throw new Error('nope')
        return `data:x;base64,${name}`
      },
    })
    expect(result.inlined).toEqual({ 'logo.png': 'data:x;base64,logo.png' })
    expect(result.issues).toEqual([
      { name: 'demo.mp4', reason: 'too-large', bytes: 500 * 1024 * 1024 },
      { name: 'still.jpg', reason: 'missing' },
      { name: 'bg.png', reason: 'unreadable', bytes: 10 },
    ])
    expect(reads).toEqual(['logo.png', 'bg.png'])
  })
  it('keeps clips out of the frames that do not play them', () => {
    expect(picturesOnly({ 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB', 'b.webm': 'x' })).toEqual({ 'logo.png': 'data:image/png;base64,AA' })
  })
})
