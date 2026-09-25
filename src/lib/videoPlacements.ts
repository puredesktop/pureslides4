/**
 * Where the videos sit on each slide, as fractions of the frame.
 *
 * A PowerPoint export is a picture of every slide with the speaker notes
 * attached; a video on a slide would be a still in that picture. So the
 * export lays the real clip over the picture at the place the board shows
 * it — and for that it needs the clip's box. The box comes from the same
 * render the board and the export use: the deck mounted in a measuring
 * frame at its own geometry, shown slide by slide, every video's rectangle
 * read against the root's. Fractions, so the caller can scale to inches.
 */
import { afterLayout, mountMeasuringFrame } from '@purescience/platform-ui/editing'
import { DECK_ASSETS_DIR } from '../constants'
import { inlineAssetUrls, type PreviewAssetMap } from './packageAssets'
import { shownSlideHtml } from './slideSeek'
import type { DeckGeometry } from './deckDocument'
import type { Slide } from './slides'

export interface VideoPlacement {
  slide: number
  /** As written in the document — `assets/demo.mp4`. */
  src: string
  /** Poster as written, when the clip has one. */
  poster?: string
  /** The clip's box as fractions of the slide frame, 0–1. */
  x: number
  y: number
  w: number
  h: number
}

type SeekWindow = Window & {
  __slideShow?: (slide: number, step: number) => void
}

/** Whether a deck has any clip worth measuring — cheap, string-level. */
export function hasVideo(html: string): boolean {
  return /<video[\s>]/i.test(html)
}

/** The source a `<video>` plays, from its attribute or its first `<source>`. */
export function videoSource(video: Element): string {
  return (
    video.getAttribute('src') ??
    video.querySelector('source')?.getAttribute('src') ??
    ''
  ).trim()
}

/**
 * The source as the DOCUMENT names it. The frame is laid out with package
 * assets inlined, so a clip's `src` there is a data URL; the export needs
 * the path in the package, never the bytes as a name.
 */
export function packageSource(src: string, previews: PreviewAssetMap): string | null {
  if (!src) return null
  if (src.startsWith('data:')) {
    const name = Object.keys(previews).find(key => previews[key] === src)
    return name ? `${DECK_ASSETS_DIR}/${name}` : null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null
  return src.replace(/^\.\//, '')
}

export async function measureVideoPlacements(
  html: string,
  slides: Slide[],
  geometry: DeckGeometry,
  /** Package assets as data URLs, so the clip is laid out as it loads. */
  previews: PreviewAssetMap = {},
): Promise<VideoPlacement[]> {
  if (!hasVideo(html)) return []
  const mounted = await mountMeasuringFrame(shownSlideHtml(inlineAssetUrls(html, previews), 0, 0), {
    sandbox: 'allow-same-origin allow-scripts',
    width: geometry.width,
    height: geometry.height,
  })
  if (!mounted.ok) return []
  const { frame } = mounted
  try {
    await afterLayout(frame.document)
    const doc = frame.document
    const win = frame.window as SeekWindow
    const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    if (!root || typeof win.__slideShow !== 'function') return []
    const placements: VideoPlacement[] = []
    for (const slide of slides) {
      win.__slideShow(slide.index, slide.steps)
      const children = [...root.children].filter(child => child.matches('[data-slide]'))
      const element = children.length ? children[slide.index] : root
      if (!element) continue
      const box = root.getBoundingClientRect()
      if (!box.width || !box.height) continue
      for (const video of element.querySelectorAll('video')) {
        const src = packageSource(videoSource(video), previews)
        if (!src) continue
        const rect = video.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        // Clipped to the frame: a full-bleed clip that overshoots by a
        // pixel must not overshoot the PowerPoint slide.
        const clamp = (value: number): number => Math.min(1, Math.max(0, value))
        const x = clamp((rect.left - box.left) / box.width)
        const y = clamp((rect.top - box.top) / box.height)
        const w = clamp((rect.right - box.left) / box.width) - x
        const h = clamp((rect.bottom - box.top) / box.height) - y
        if (w <= 0 || h <= 0) continue
        const poster = video.getAttribute('poster')
        placements.push({ slide: slide.index, src, ...(poster ? { poster } : {}), x, y, w, h })
      }
    }
    return placements
  } finally {
    frame.dispose()
  }
}
