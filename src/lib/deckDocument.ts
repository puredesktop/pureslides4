/**
 * The deck document, and its package.
 *
 * A `.deck` folder holds `index.html` (every slide), `manifest.json` (title,
 * brief, what each asset is) and `assets/`. Geometry lives in the HTML on the
 * deck root, never duplicated in the manifest — one place to read it from,
 * so an edit by hand, by an agent or by the app can never disagree.
 */
import {
  BUILD_CSS,
} from './slideSeek'
import {
  DEFAULT_DECK_ID,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  DEFAULT_SLIDE_SECONDS,
} from '../constants'
import type { AssetNote } from './assetNotes'

export const DEFAULT_DECK_TITLE = 'Untitled deck'

/**
 * True while a deck has never been named.
 *
 * The switcher numbers same-named drafts, so an untouched deck can be
 * "Untitled deck 7" — still unnamed, and still safe to rename from a draft.
 * A title someone typed is never overwritten.
 */
export function isDefaultDeckTitle(title: string): boolean {
  return new RegExp(`^${DEFAULT_DECK_TITLE}(\\s+\\d+)?$`, 'i').test(
    (title ?? '').trim(),
  )
}

export interface DeckDocument {
  title: string
  html: string
}

export interface DeckGeometry {
  width: number
  height: number
  deckId: string
}

function parse(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function rootOf(doc: Document): Element | null {
  return doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
}

export function geometryFromHtml(html: string): DeckGeometry {
  const doc = parse(html)
  const root = doc ? rootOf(doc) : null
  const read = (name: string, fallback: number): number => {
    const value = Number(root?.getAttribute(name))
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  return {
    width: read('data-width', DEFAULT_WIDTH),
    height: read('data-height', DEFAULT_HEIGHT),
    deckId: root?.getAttribute('data-deck-id') || DEFAULT_DECK_ID,
  }
}

export function withGeometry(
  html: string,
  patch: Partial<Omit<DeckGeometry, 'deckId'>>,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  if (patch.width && patch.width > 0) {
    root.setAttribute('data-width', String(Math.round(patch.width)))
  }
  if (patch.height && patch.height > 0) {
    root.setAttribute('data-height', String(Math.round(patch.height)))
  }
  const geometry = geometryFromHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`)
  root.setAttribute(
    'style',
    `width: ${geometry.width}px; height: ${geometry.height}px; position: relative; overflow: hidden`,
  )
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

/** A starter slide, marked so drafting knows nobody wrote it. */
export function createStarterSlideHtml(title = DEFAULT_DECK_TITLE): string {
  return `<div data-slide data-block="starter" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: #ffffff; text-align: center">
      <h1 style="margin: 0; font-size: 64px; font-weight: 800; letter-spacing: -0.03em; color: #1b1b1e">${title}</h1>
      <p style="margin: 0; font-size: 22px; color: #6d6f73">Write slides in HTML. Present them. Export a PDF.</p>
    </div>`
}

export function createDefaultDeckDocument(
  title = DEFAULT_DECK_TITLE,
): DeckDocument {
  return {
    title,
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0e0e11; }
      #deck { font-family: Archivo, system-ui, -apple-system, sans-serif; }
      [data-slide] { box-sizing: border-box; }
${BUILD_CSS}
    </style>
  </head>
  <body>
    <div id="deck" data-deck-id="${DEFAULT_DECK_ID}" data-width="${DEFAULT_WIDTH}" data-height="${DEFAULT_HEIGHT}" style="width: ${DEFAULT_WIDTH}px; height: ${DEFAULT_HEIGHT}px; position: relative; overflow: hidden">
    ${createStarterSlideHtml(title)}
    </div>
  </body>
</html>
`,
  }
}

export interface DeckManifest {
  title: string
  contentFile?: string
  brief?: string
  /** The wizard's "Look" choice — absent means the default, `auto`. */
  look?: string
  /** The wizard's "Slides (about)" target — absent means the default. */
  slideCount?: number
  assets?: AssetNote[]
}

export function parsePackageManifest(text: string): DeckManifest {
  const parsed = JSON.parse(text) as Record<string, unknown>
  const assets = Array.isArray(parsed.assets)
    ? (parsed.assets as Record<string, unknown>[])
        .filter(entry => entry && typeof entry.name === 'string')
        .map(entry => ({
          name: String(entry.name),
          description:
            typeof entry.description === 'string' ? entry.description : '',
          ...(entry.described === true ? { described: true } : {}),
          ...(entry.role === 'reference' || entry.role === 'logo'
            ? { role: entry.role as AssetNote['role'] }
            : {}),
        }))
    : undefined
  return {
    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title
        : DEFAULT_DECK_TITLE,
    ...(typeof parsed.contentFile === 'string'
      ? { contentFile: parsed.contentFile }
      : {}),
    ...(typeof parsed.brief === 'string' ? { brief: parsed.brief } : {}),
    ...(typeof parsed.look === 'string' && parsed.look.trim()
      ? { look: parsed.look }
      : {}),
    ...(typeof parsed.slideCount === 'number' &&
    Number.isFinite(parsed.slideCount) &&
    parsed.slideCount > 0
      ? { slideCount: Math.round(parsed.slideCount) }
      : {}),
    ...(assets ? { assets } : {}),
  }
}

export function serializePackageManifest(manifest: DeckManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** Seconds the whole deck runs in a timed export. */
export function deckSeconds(perSlide: number[]): number {
  return perSlide.reduce(
    (total, seconds) => total + (seconds > 0 ? seconds : DEFAULT_SLIDE_SECONDS),
    0,
  )
}

/** A one-line summary for the agent, and for the header. */
export function summarizeDeck(
  document: DeckDocument,
  slideCount: number,
): Record<string, unknown> {
  const geometry = geometryFromHtml(document.html)
  return {
    title: document.title,
    slides: slideCount,
    width: geometry.width,
    height: geometry.height,
  }
}
