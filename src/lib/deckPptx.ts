import PptxGenJS from 'pptxgenjs'

/**
 * The deck as a PowerPoint file: one slide per slide, each a full-bleed
 * picture of the board's verified render, with the speaker notes attached
 * as real notes, and every video laid over its picture as a real media
 * object at the same box, so it plays in PowerPoint. It looks exactly like
 * the board and opens anywhere; the text is a picture, not type — a
 * faithful print, not an editable copy.
 *
 * The slide size follows the deck's geometry, so a 16:9 deck stays 16:9
 * and a 4:3 one stays 4:3; PowerPoint measures in inches, and 13.333 in
 * wide is its own widescreen default.
 */

/** A clip laid over the picture slide, where the board shows it. */
export interface PptxVideo {
  /** The clip's bytes, bare base64. */
  base64: string
  /** File extension — `mp4`; PowerPoint plays H.264 MP4. */
  extn: string
  /** The clip's box as fractions of the slide, 0–1. */
  x: number
  y: number
  w: number
  h: number
  /** A `data:image/…;base64,…` poster shown until the clip plays. */
  cover?: string
}

export interface PptxFrame {
  /** A `data:image/png;base64,…` URL, as the frame reader returns it. */
  dataUrl: string
  /** Speaker notes for this slide, if any. */
  notes?: string
  /** Real video, placed over the picture at the board's geometry. */
  videos?: PptxVideo[]
}

export interface PptxDeckInput {
  title: string
  width: number
  height: number
  frames: PptxFrame[]
}

/** Slide width in inches; the height follows the deck's own aspect. */
export const PPTX_WIDTH_IN = 13.333

export function pptxLayout(width: number, height: number): { width: number; height: number } {
  const w = PPTX_WIDTH_IN
  const h = Math.round((w * (height / Math.max(1, width))) * 1000) / 1000
  return { width: w, height: Math.max(1, h) }
}

/** The base64 payload of a data URL; a bare base64 string passes through. */
export function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return dataUrl.startsWith('data:') && comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl
}

/** Build the file and return its bytes as base64, ready for the file bridge. */
export async function buildDeckPptx(input: PptxDeckInput): Promise<string> {
  if (!input.frames.length) throw new Error('a deck with no slides has nothing to export')
  const pres = new PptxGenJS()
  const layout = pptxLayout(input.width, input.height)
  pres.defineLayout({ name: 'DECK', width: layout.width, height: layout.height })
  pres.layout = 'DECK'
  pres.title = input.title
  for (const frame of input.frames) {
    const slide = pres.addSlide()
    slide.addImage({
      data: `image/png;base64,${base64Of(frame.dataUrl)}`,
      x: 0,
      y: 0,
      w: layout.width,
      h: layout.height,
    })
    for (const video of frame.videos ?? []) {
      // The picture underneath shows the clip's first frame; the media
      // object on top plays. Same box, so nothing shifts when it starts.
      slide.addMedia({
        type: 'video',
        data: `video/${video.extn};base64,${base64Of(video.base64)}`,
        extn: video.extn,
        x: video.x * layout.width,
        y: video.y * layout.height,
        w: video.w * layout.width,
        h: video.h * layout.height,
        ...(video.cover ? { cover: video.cover } : {}),
      })
    }
    const notes = frame.notes?.trim()
    if (notes) slide.addNotes(notes)
  }
  const out = await pres.write({ outputType: 'base64' })
  if (typeof out !== 'string') throw new Error('the PowerPoint writer returned no file')
  return out
}
