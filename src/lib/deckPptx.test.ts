import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { base64Of, buildDeckPptx, pptxLayout } from './deckPptx'

// A 2×1 PNG, enough for the writer to embed.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVQIW2P4z8DwHwAFAAH/q842AAAAAElFTkSuQmCC'

describe('the deck as PowerPoint', () => {
  it('keeps the deck aspect at PowerPoint widescreen width', () => {
    expect(pptxLayout(1920, 1080)).toEqual({ width: 13.333, height: 7.5 })
    expect(pptxLayout(1024, 768)).toEqual({ width: 13.333, height: 10 })
  })

  it('reads the payload of a data url and passes bare base64 through', () => {
    expect(base64Of('data:image/png;base64,QUJD')).toBe('QUJD')
    expect(base64Of('QUJD')).toBe('QUJD')
  })

  it('writes one picture slide per frame with its notes', async () => {
    const base64 = await buildDeckPptx({
      title: 'Q3 review',
      width: 1920,
      height: 1080,
      frames: [
        { dataUrl: PNG, notes: 'Open with the number.' },
        { dataUrl: PNG },
        { dataUrl: PNG, notes: '  ' },
      ],
    })
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'))
    const names = Object.keys(zip.files)
    expect(names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(3)
    expect(names.filter(name => /^ppt\/media\/.*\.png$/.test(name)).length).toBeGreaterThanOrEqual(3)
    // The writer gives every slide a notes page; only the first carries words.
    const notes = names.filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).sort()
    expect(notes).toHaveLength(3)
    const texts = await Promise.all(notes.map(name => zip.file(name)!.async('string')))
    expect(texts.filter(text => text.includes('Open with the number.'))).toHaveLength(1)
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    // 13.333 in × 7.5 in, in EMU.
    expect(presentation).toContain('cx="12191695"')
    expect(presentation).toContain('cy="6858000"')
  })

  it('refuses an empty deck', async () => {
    await expect(buildDeckPptx({ title: 'x', width: 1920, height: 1080, frames: [] })).rejects.toThrow(/no slides/)
  })
  it('lays a real clip over the picture, where the board shows it', async () => {
    const base64 = await buildDeckPptx({
      title: 'Demo',
      width: 1280,
      height: 720,
      frames: [
        { dataUrl: PNG, videos: [{ base64: 'AAAAHGZ0eXBpc29t', extn: 'mp4', x: 0.25, y: 0.5, w: 0.5, h: 0.25 }] },
      ],
    })
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'))
    const names = Object.keys(zip.files)
    expect(names.some(name => /^ppt\/media\/.*\.mp4$/.test(name))).toBe(true)
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(slide).toContain('<a:videoFile')
    // 13.333 in × 7.5 in; the clip's box in EMU (914400 per inch).
    const emu = (inches: number): string => String(Math.round(inches * 914400))
    expect(slide).toContain(`<a:off x="${emu(13.333 * 0.25)}" y="${emu(7.5 * 0.5)}"/>`)
    expect(slide).toContain(`<a:ext cx="${emu(13.333 * 0.5)}" cy="${emu(7.5 * 0.25)}"/>`)
  })
})
