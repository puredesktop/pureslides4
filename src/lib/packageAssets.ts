/**
 * Preview/render asset parity.
 *
 * The package holds real files under `assets/`, and the document on disk
 * references them relatively — `assets/logo.png`, `assets/demo.mp4`. The
 * print and frame renderers load the document from the package, so those
 * paths resolve natively.
 *
 * The board cannot: every slide frame is a sandboxed srcDoc iframe with an
 * opaque origin, and a relative path in one resolves against the app's dev
 * server — a 404. So the frames inline. The rule this module fixes is WHAT
 * they inline: every asset the document references, read from disk
 * deterministically, capped by size with an explicit "too large to preview"
 * state, so what the board shows is what the render captures — and when it
 * is not, the app says so.
 *
 * The inlining is view-time only and must be undone before anything a frame
 * hands back is written to the document: an inline edit serializes from the
 * inlined DOM, and without `deinlineAssetUrls` every element typed into by
 * hand would commit megabytes of base64 into index.html.
 */
import { DECK_ASSETS_DIR } from '../constants'

/** Per-asset ceiling for inlining a picture into the preview. */
export const PREVIEW_ASSET_MAX_BYTES = 12 * 1024 * 1024
/** Videos are bigger by nature; past this they are named, not shown. */
export const PREVIEW_VIDEO_MAX_BYTES = 96 * 1024 * 1024

const VIDEO_NAME = /\.(mp4|webm|mov|m4v)$/i

/** The cap for one asset, by what it is. */
export function previewCapFor(name: string): number {
  return VIDEO_NAME.test(name) ? PREVIEW_VIDEO_MAX_BYTES : PREVIEW_ASSET_MAX_BYTES
}

const REFERENCE_PATTERN =
  /(src|href|poster)=("|')(?:\.\/)?assets\/([^"']+)\2|url\((?:"|')?(?:\.\/)?assets\/([^"')]+)(?:"|')?\)/g

/**
 * Every `assets/<name>` the document references — src, href, poster and
 * CSS `url()`. Names come back decoded and unique, in document order.
 */
export function referencedAssetNames(html: string): string[] {
  const names: string[] = []
  for (const match of html.matchAll(REFERENCE_PATTERN)) {
    const raw = (match[3] ?? match[4] ?? '').split(/[?#]/)[0]
    if (!raw) continue
    let name = raw
    try {
      name = decodeURIComponent(raw)
    } catch {
      /* keep it as written */
    }
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Data URLs by asset name — the map the preview inlines from. */
export type PreviewAssetMap = Record<string, string>

/**
 * The map without its clips. A card, a measurement, a print preview show
 * a clip's box, not the clip: inlining tens of megabytes of video into
 * every frame of the strip costs memory the renderer does not have, and
 * a frame that does not play has no use for the bytes. Only a live frame
 * — the stage, presenting — gets the whole map.
 */
export function picturesOnly(previews: PreviewAssetMap): PreviewAssetMap {
  const kept: PreviewAssetMap = {}
  for (const [name, url] of Object.entries(previews)) {
    if (!VIDEO_NAME.test(name)) kept[name] = url
  }
  return kept
}

/** Why an asset is not in the preview map. */
export type PreviewAssetIssue = {
  name: string
  reason: 'too-large' | 'missing' | 'unreadable'
  bytes?: number
}

export interface PreviewAssets {
  inlined: PreviewAssetMap
  issues: PreviewAssetIssue[]
}

/**
 * Resolve the referenced assets from disk into data URLs, deterministically.
 *
 * `sizeOf` answers a file's size (or `null` when it is not there) so a file
 * past its cap is skipped without reading it; `read` fetches the data URL.
 * Already-loaded entries in `known` are reused so a re-resolve after an
 * edit costs nothing for files it has seen.
 */
export async function resolvePreviewAssets(
  html: string,
  options: {
    sizeOf: (name: string) => Promise<number | null>
    read: (name: string, maxBytes: number) => Promise<string>
    known?: PreviewAssetMap
    capFor?: (name: string) => number
  },
): Promise<PreviewAssets> {
  const capFor = options.capFor ?? previewCapFor
  const inlined: PreviewAssetMap = {}
  const issues: PreviewAssetIssue[] = []
  for (const name of referencedAssetNames(html)) {
    const known = options.known?.[name]
    if (known) {
      inlined[name] = known
      continue
    }
    const bytes = await options.sizeOf(name).catch(() => null)
    if (bytes === null) {
      issues.push({ name, reason: 'missing' })
      continue
    }
    const cap = capFor(name)
    if (bytes > cap) {
      issues.push({ name, reason: 'too-large', bytes })
      continue
    }
    try {
      inlined[name] = await options.read(name, cap)
    } catch {
      issues.push({ name, reason: 'unreadable', bytes })
    }
  }
  return { inlined, issues }
}

/**
 * The package holds real files; the preview inlines them.
 *
 * At view time only, `assets/<name>` references are swapped for data URLs.
 * The document on disk keeps its clean relative paths.
 */
export function inlineAssetUrls(html: string, previews: PreviewAssetMap): string {
  if (!Object.keys(previews).length) return html
  return html.replace(REFERENCE_PATTERN, (match, attr, quote, attrName, cssName) => {
    const raw = ((attrName ?? cssName) as string).split(/[?#]/)[0]
    let name = raw
    try {
      name = decodeURIComponent(raw)
    } catch {
      /* as written */
    }
    const data = previews[name] ?? previews[raw]
    if (!data) return match
    return attrName ? `${attr}=${quote}${data}${quote}` : `url(${data})`
  })
}

export interface DeinlineResult {
  html: string
  /** Data URLs that were NOT ours — genuinely pasted content, kept as is. */
  unknownDataUrls: number
  /** Asset names that were mapped back. */
  restored: string[]
}

/**
 * Undo `inlineAssetUrls` on markup a frame hands back: every data URL that
 * came from the preview map goes back to its `assets/<name>` path. A data
 * URL the map does not know is genuinely pasted content and stays —
 * counted, so the status can say so rather than silently keeping base64.
 */
export function deinlineAssetUrls(html: string, previews: PreviewAssetMap): DeinlineResult {
  let next = html
  const restored: string[] = []
  // Longest first, so the replacement is independent of map order.
  const entries = Object.entries(previews)
    .filter(([, url]) => url.startsWith('data:'))
    .sort((a, b) => b[1].length - a[1].length)
  for (const [name, url] of entries) {
    if (!next.includes(url)) continue
    next = next.split(url).join(`${DECK_ASSETS_DIR}/${name}`)
    restored.push(name)
  }
  const unknownDataUrls = (next.match(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/gi) ?? []).length
  return { html: next, unknownDataUrls, restored }
}

/** People words for what the preview could not show. */
export function previewIssuesMessage(issues: PreviewAssetIssue[]): string | null {
  if (!issues.length) return null
  const parts = issues.map(issue => {
    if (issue.reason === 'too-large') {
      const mb = issue.bytes ? ` (${Math.round(issue.bytes / 1024 / 1024)} MB)` : ''
      return `${DECK_ASSETS_DIR}/${issue.name} is too large to preview${mb} — the export will use it`
    }
    if (issue.reason === 'missing') {
      return `${DECK_ASSETS_DIR}/${issue.name} is referenced but not in the package`
    }
    return `${DECK_ASSETS_DIR}/${issue.name} could not be read for the preview`
  })
  return parts.join('; ')
}
