/**
 * Getting the deck out: PDF, images, or video.
 *
 * All three read the same document through the same seek, which is the point
 * — a build that looks right on the board is the build that lands on the page
 * and in the frame. What differs is only which instants get captured:
 *
 * - PDF   one page per slide, every step revealed (paper has no presses)
 * - Images  one PNG per slide, same rule
 * - Video   slides on a clock, steps spread across each slide's seconds,
 *           the frames encoded into a real .mp4 (WebCodecs + mp4-muxer)
 *
 * None of this needed a new shell primitive: `render.printHtml` paginates,
 * `render.captureFrameSequence` seeks one loaded page N times, and both were
 * already there for PureVideo — as was the encoder this borrows.
 */
import {
  captureFrames,
  createFolder,
  deletePath,
  onRenderProgress,
  printHtml,
  readBinaryBase64,
  readBinaryDataUrl,
  writeBinaryFile,
  writeTextFile,
} from '../bridge/platformBridge'
import {
  ensureExportable,
  renderFingerprint,
  type VerificationState,
} from '@purescience/platform-ui/editing'
import { base64FromBytes, canEncodeVideo, encodeFramesToMp4 } from './encodeMp4'
import {
  DECK_EXPORT_DIR,
  EXPORT_FPS,
  MAX_EXPORT_FRAMES,
} from '../constants'
import { checkDeck } from './checkDeck'
import { hashDeck } from './deckDoor'
import { geometryFromHtml } from './deckDocument'
import { buildDeckPptx, type PptxVideo } from './deckPptx'
import type { VideoPlacement } from './videoPlacements'
import { SEEK_ENGINE, printScript, shownSlideHtml } from './slideSeek'
import type { Slide } from './slides'

export class ExportCancelled extends Error {
  constructor() {
    super('Export stopped.')
    this.name = 'ExportCancelled'
  }
}

export type ExportRefusalReason = 'checking' | 'failed' | 'blocked'

/**
 * The export was not run. Thrown from INSIDE the pipeline, so every caller —
 * the dialog's button and the agent's exportDeck tool alike — is refused the
 * same way with the same words; there is no path around it.
 */
export class ExportRefused extends Error {
  readonly reason: ExportRefusalReason
  constructor(reason: ExportRefusalReason, message: string) {
    super(message)
    this.name = 'ExportRefused'
    this.reason = reason
  }
}

/**
 * The deck's verification, as the pipeline asks for it: the state NOW, a
 * re-check that measures every slide in a visible frame, and the words for
 * a failed state (which slides, and what to do).
 */
export interface ExportVerification {
  state: () => VerificationState
  recheck: () => Promise<unknown>
  failedMessage: () => string
}

export type ExportKind = 'pdf' | 'images' | 'video' | 'pptx'

export interface ExportProgressState {
  phase: 'idle' | 'preparing' | 'working' | 'done' | 'error'
  unit: number
  unitCount: number
  message: string
  outputPath?: string
}

export interface ExportRequest {
  html: string
  slides: Slide[]
  documentPath: string
  /** The deck's title — the output file is named from it, not the app's. */
  title: string
  kind: ExportKind
  /** Include a speaker-notes appendix in the PDF. */
  notesAppendix?: boolean
  onProgress?: (state: ExportProgressState) => void
  shouldCancel?: () => boolean
  /**
   * Required, not optional: nothing leaves the app from a render that is
   * not verified. The pipeline re-checks first, then refuses out loud.
   */
  verify: ExportVerification
  /**
   * Where the deck's videos sit, measured by the app in a frame; the
   * PowerPoint export lays each clip over its slide's picture there. A
   * deck without video passes nothing.
   */
  videos?: VideoPlacement[]
}

export interface ExportResult {
  kind: ExportKind
  outputPath: string
  units: number
  /** PDF only: sheets the file actually has, when they could be counted. */
  sheets?: number | null
  /** PDF only: sheets the document asked for — one per slide, plus the appendix. */
  expectedSheets?: number
}

/** A filesystem-safe stem from the deck's title — `Q3 Review!` → `q3-review`. */
export function fileStem(title: string): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'deck'
}

/**
 * Turn the deck's own state into a printable document.
 *
 * ONE render path. Every page holds a copy of the deck root exactly as the
 * board's frames render it, and the print driver calls the same core the
 * frames call — show this slide, apply its last step, fit it. Paper adds
 * one rule and one only: every build step is revealed, because paper has no
 * presses. Speaker notes stay hidden the way the markup hides them on
 * screen; nothing is stripped, restyled or forced with !important, so a
 * page cannot show something the stage would not.
 *
 * The only print-only markup is the page box around each root. It is
 * fingerprinted on the document (`data-print-fingerprint`), so a print run
 * that does not match the board — the wrong sheet count — is reported as a
 * failure rather than passed off as the deck.
 */
export const PRINT_ENGINE = `${SEEK_ENGINE}/print-2`

export function printFingerprint(html: string): string {
  const geometry = geometryFromHtml(html)
  return `${hashDeck(html)}|${renderFingerprint({
    surface: { kind: 'sheet', width: geometry.width, height: geometry.height },
    fonts: '',
    dpr: 1,
    engine: PRINT_ENGINE,
  })}`
}

export function printableHtml(
  html: string,
  options: { notesAppendix?: boolean; notes?: string[] } = {},
): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root =
    doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html
  const geometry = geometryFromHtml(html)

  const slides = [...root.children].filter(child =>
    child.matches('[data-slide]'),
  )
  const count = slides.length ? slides.length : 1
  const bodies: string[] = []
  for (let index = 0; index < count; index += 1) {
    // The whole root, not the slide alone: the author's stylesheet may
    // address a slide by its place among its siblings, and the frames show
    // the root with the other slides hidden — so does the page.
    const copy = root.cloneNode(true) as Element
    for (const video of copy.querySelectorAll('video')) {
      video.replaceWith(videoPlaceholder(doc, video))
    }
    bodies.push(
      `<section class="pv-page" data-slide-index="${index}">${copy.outerHTML}</section>`,
    )
  }

  const appendix =
    options.notesAppendix && options.notes?.some(note => note.trim())
      ? `<section class="pv-page pv-notes"><h2>Speaker notes</h2><ol>${options.notes
          .map(note => `<li>${note.trim() ? note : '—'}</li>`)
          .join('')}</ol></section>`
      : ''

  const headStyles = [...doc.querySelectorAll('head style, head link')]
    .map(node => node.outerHTML)
    .join('\n')

  return `<!DOCTYPE html>
<html data-print-fingerprint="${printFingerprint(html)}">
  <head>
    <meta charset="utf-8" />
${headStyles}
    <style>
      @page { size: ${geometry.width}px ${geometry.height}px; margin: 0; }
      html, body { margin: 0; padding: 0; background: #ffffff; }
      .pv-page {
        position: relative;
        width: ${geometry.width}px;
        height: ${geometry.height}px;
        overflow: hidden;
        break-after: page;
      }
      /* The one rule paper needs beyond the page box. A slide the fit has
         scaled is laid out taller than the frame and shrunk by a transform;
         a printer fragments by LAYOUT position, so without this the part of
         the slide past the page's bottom edge is cut from the sheet even
         though it is painted inside it. Size containment makes the deck
         root monolithic — one sheet, whole — and changes nothing about a
         root that already has an explicit size. */
      .pv-page > [data-deck-id] { contain: size; }
      .pv-notes { padding: 64px; background: #ffffff; color: #1b1b1e;
        font-family: Archivo, system-ui, sans-serif; }
      .pv-notes h2 { margin: 0 0 24px; font-size: 32px; }
      .pv-notes li { margin-bottom: 14px; font-size: 16px; line-height: 1.5; }
    </style>
  </head>
  <body>
${bodies.join('\n')}
${appendix}
${printScript()}
  </body>
</html>
`
}

/**
 * Paper cannot play. A video on a slide becomes its poster where it has
 * one, and otherwise a plain panel that says what would play there — in
 * the clip's own box, with its own style, so the page keeps its layout.
 */
export function videoPlaceholder(doc: Document, video: Element): Element {
  const box = doc.createElement('div')
  box.setAttribute('data-video-placeholder', '')
  const style = video.getAttribute('style')
  if (style) box.setAttribute('style', style)
  const className = video.getAttribute('class')
  if (className) box.setAttribute('class', className)
  const poster = video.getAttribute('poster')
  if (poster) {
    const image = doc.createElement('img')
    image.setAttribute('src', poster)
    image.setAttribute('alt', '')
    image.setAttribute('style', 'width: 100%; height: 100%; object-fit: cover; display: block')
    box.appendChild(image)
    return box
  }
  const src =
    video.getAttribute('src') ?? video.querySelector('source')?.getAttribute('src') ?? ''
  const name = src.split(/[?#]/)[0].split('/').pop() ?? ''
  box.setAttribute(
    'style',
    `${style ? `${style}; ` : ''}display: grid; place-items: center; background: #101013; color: #d5d5db; font-family: system-ui, sans-serif`,
  )
  box.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; gap: 12px"><svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="27" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 17l18 11-18 11z" fill="currentColor"/></svg><div style="font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8">Video${name ? ` · ${name}` : ''}</div></div>`
  return box
}

/** How many sheets a print document asks for: one per slide, plus the appendix. */
export function expectedSheets(
  slides: Slide[],
  options: { notesAppendix?: boolean } = {},
): number {
  const pages = Math.max(1, slides.length)
  const appendix = options.notesAppendix && slides.some(slide => slide.notes.trim()) ? 1 : 0
  return pages + appendix
}

/**
 * Sheets in a finished PDF, from its page objects. Cheap and good enough to
 * catch the one failure the print scaffold could introduce — a page box that
 * did not become exactly one sheet.
 */
export function countPdfSheets(pdfBytes: string): number {
  const matches = pdfBytes.match(/\/Type\s*\/Page(?![s\w])/g)
  return matches ? matches.length : 0
}

/**
 * The gate: the kit's guard first (re-check in a visible frame, then refuse
 * anything not verified), then the deck's own static check. Thrown, so the
 * pipeline stops here for every caller.
 */
export async function assertDeckExportable(
  html: string,
  verify: ExportVerification,
): Promise<void> {
  const blocking = checkDeck(html).filter(finding => finding.severity === 'error')
  if (blocking.length) {
    throw new ExportRefused(
      'blocked',
      `The deck would not export cleanly: ${blocking.map(finding => `${finding.message} — ${finding.fix}`).join('; ')}`,
    )
  }
  const decision = await ensureExportable(verify.state, verify.recheck)
  if (!decision.ok) {
    throw new ExportRefused(
      decision.reason,
      decision.reason === 'failed' ? verify.failedMessage() : decision.message,
    )
  }
}

/**
 * Frame times for a timed export.
 *
 * A slide holds for its seconds; its build steps are spread evenly across
 * that hold, so a three-step slide shows each step for a third of its time.
 * Returned as (slide, step) pairs — the same coordinates everything else
 * uses, so the video is the deck rather than a second rendering of it.
 */
export function videoTimeline(
  slides: Slide[],
  fps = EXPORT_FPS,
): { slide: number; step: number }[] {
  const frames: { slide: number; step: number }[] = []
  slides.forEach((slide, index) => {
    const held = Math.max(1, Math.round(slide.seconds * fps))
    const stops = slide.steps + 1
    for (let frame = 0; frame < held; frame += 1) {
      const step = Math.min(slide.steps, Math.floor((frame / held) * stops))
      frames.push({ slide: index, step })
    }
  })
  return frames
}

/** The name the shell gives frame `index` — `{i}` is zero-padded to five. */
export function frameFileName(index: number): string {
  return `frame-${String(index).padStart(5, '0')}.png`
}

/** A clip past this is left as its still rather than exploding the .pptx. */
export const MAX_PPTX_VIDEO_BYTES = 512 * 1024 * 1024

/**
 * The part of a captured frame inside a box, as a PNG data URL — the
 * cover a clip shows until it plays. Needs a canvas; without one (tests,
 * a runtime that cannot draw) there is no cover and PowerPoint shows its
 * own.
 */
export async function cropDataUrl(
  dataUrl: string,
  box: { x: number; y: number; w: number; h: number },
): Promise<string | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('frame did not load'))
    image.src = dataUrl
  })
  const width = Math.max(1, Math.round(image.naturalWidth * box.w))
  const height = Math.max(1, Math.round(image.naturalHeight * box.h))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(
    image,
    Math.round(image.naturalWidth * box.x),
    Math.round(image.naturalHeight * box.y),
    width,
    height,
    0,
    0,
    width,
    height,
  )
  const out = canvas.toDataURL('image/png')
  return out.startsWith('data:image/png;base64,') && out.length > 32 ? out : undefined
}

/**
 * The renderer captures a viewport taller than a slide (its height is
 * fixed, its width is the deck's), so a frame carries dead space under the
 * deck. Everything cut from frames — the picture slides, the video — is
 * cut to the deck's own aspect first. In pixels, at the frame's width.
 */
export function deckFrameSize(
  captured: { width: number; height: number },
  geometry: { width: number; height: number },
): { width: number; height: number } {
  const height = Math.round((captured.width * geometry.height) / Math.max(1, geometry.width))
  return { width: captured.width, height: Math.min(captured.height, Math.max(1, height)) }
}

/** The part of a captured frame that is the deck, 0–1 of its height. */
export function deckFrameKeep(
  captured: { width: number; height: number },
  geometry: { width: number; height: number },
): number {
  const wanted = deckFrameSize(captured, geometry).height
  return Math.min(1, wanted / Math.max(1, captured.height))
}

/** A captured frame cut to the deck; the frame itself when nothing can be cut. */
export async function frameToDeck(
  dataUrl: string,
  captured: { width: number; height: number },
  geometry: { width: number; height: number },
): Promise<string> {
  const keep = deckFrameKeep(captured, geometry)
  if (keep > 0.998) return dataUrl
  return (await cropDataUrl(dataUrl, { x: 0, y: 0, w: 1, h: keep }).catch(() => undefined)) ?? dataUrl
}

export async function exportDeck(request: ExportRequest): Promise<ExportResult> {
  const { html, slides, documentPath, title, kind, onProgress, shouldCancel } =
    request
  const root = documentPath.replace(/\/+$/, '')
  const geometry = geometryFromHtml(html)
  const report = (state: Partial<ExportProgressState>): void => {
    onProgress?.({
      phase: 'working',
      unit: 0,
      unitCount: slides.length,
      message: '',
      ...state,
    } as ExportProgressState)
  }

  // Nothing leaves from a render that is not verified — and this is the
  // pipeline, so the agent's tool is held to it exactly as the button is.
  report({ phase: 'preparing', message: 'Checking the layout…' })
  await assertDeckExportable(html, request.verify)
  if (shouldCancel?.()) throw new ExportCancelled()

  await createFolder(root, DECK_EXPORT_DIR)
  const exportsDir = `${root}/${DECK_EXPORT_DIR}`
  // The output file is named from the DECK's title, not the browser tab's:
  // stemming from `document.title` named every deck's export the same.
  const stem = fileStem(title)

  if (kind === 'pdf') {
    report({ phase: 'preparing', message: 'Laying out the pages…' })
    if (shouldCancel?.()) throw new ExportCancelled()
    const printPath = `${root}/.print.html`
    const outputPath = `${exportsDir}/${stem}.pdf`
    try {
      await writeTextFile(
        printPath,
        printableHtml(html, {
          notesAppendix: request.notesAppendix,
          notes: slides.map(slide => slide.notes),
        }),
      )
      report({
        phase: 'working',
        unit: 0,
        message: `Printing ${slides.length} pages…`,
      })
      await printHtml({
        htmlPath: printPath,
        outputPath,
        basePath: root,
        pageSize: `${geometry.width}px ${geometry.height}px`,
        margins: '0',
        // Each slide is already a page box of exactly the right size, so
        // Paged.js has only to honour the breaks it is given.
        paginate: 'pagedjs',
        loadingMessage: `Printing ${slides.length} slides`,
      })
    } finally {
      // The print document is scaffolding, not output — leaving it behind
      // pollutes the package a person or another app will open next.
      try {
        await deletePath(printPath, false)
      } catch {
        /* nothing to clean up */
      }
    }
    // The one print-only rule is the page box; the one way it can fail is
    // a box that did not become exactly one sheet. Count them, so a
    // divergence is reported rather than handed over as the deck.
    const expected = expectedSheets(slides, { notesAppendix: request.notesAppendix })
    let sheets: number | null = null
    try {
      const read = await readBinaryBase64(outputPath, 64 * 1024 * 1024)
      sheets = countPdfSheets(atob(read.base64))
    } catch {
      sheets = null
    }
    report({
      phase: 'done',
      unit: slides.length,
      message:
        sheets !== null && sheets !== expected
          ? `Wrote ${sheets} sheets for ${expected} expected — the print run does not match the board.`
          : `Wrote ${slides.length} pages.`,
      outputPath,
    })
    return { kind, outputPath, units: slides.length, sheets, expectedSheets: expected }
  }

  // Images, PowerPoint and video all capture frames; they differ in which
  // instants: a still per slide at its last step, or the clock.
  const instants =
    kind === 'images' || kind === 'pptx'
      ? slides.map((slide, index) => ({ slide: index, step: slide.steps }))
      : videoTimeline(slides)

  if (instants.length > MAX_EXPORT_FRAMES) {
    throw new Error(
      `that is ${instants.length} frames — more than this exporter will do in one pass (${MAX_EXPORT_FRAMES}). Shorten the deck or its slide timings.`,
    )
  }

  report({
    phase: 'preparing',
    unitCount: instants.length,
    message: 'Preparing the deck…',
  })
  if (shouldCancel?.()) throw new ExportCancelled()

  const framePath = `${root}/.frame.html`
  const framesDir = `${exportsDir}/frames`
  await createFolder(exportsDir, 'frames')

  let unsubscribe: (() => void) | null = null
  let captured: { width: number; height: number } | null = null
  try {
    await writeTextFile(framePath, shownSlideHtml(html, 0, 0))
    const fold = createCaptureProgress(instants.length)
    unsubscribe = onRenderProgress((event: { pct?: number; message?: string }) => {
      const next = fold(event)
      if (next) report({ phase: 'working', unit: next.unit, message: next.message })
    })

    captured = await captureFrames({
      htmlPath: framePath,
      outputDir: framesDir,
      // The renderer calls one function per instant; ours takes two numbers,
      // so each instant is encoded as `slide + step/1000` and split again in
      // the page. Ugly at the seam, but it keeps the shell contract generic.
      times: instants.map(instant => instant.slide + instant.step / 1000),
      // Images keep their numbered files; PowerPoint and video read frames back.
      namePattern: kind === 'images' ? 'slide-{i}.png' : 'frame-{i}.png',
      width: geometry.width,
      loadingMessage: `Capturing ${instants.length}`,
    })
  } finally {
    unsubscribe?.()
    // The frozen-frame document is scaffolding; the frames or the video are
    // the output.
    try {
      await deletePath(framePath, false)
    } catch {
      /* nothing to clean up */
    }
  }

  if (kind === 'pptx') {
    // PowerPoint: one picture slide per frame, the board's verified render,
    // with the speaker notes attached as real notes. The frames were
    // scaffolding; the .pptx is the output.
    if (shouldCancel?.()) throw new ExportCancelled()
    report({ phase: 'working', unit: 0, unitCount: instants.length, message: 'Packing the slides…' })
    const frames: Array<{ dataUrl: string; notes?: string; videos?: PptxVideo[] }> = []
    const clips = new Map<string, Promise<{ base64: string; extn: string } | null>>()
    const clipFor = (src: string): Promise<{ base64: string; extn: string } | null> => {
      // Only a path inside the package is a file to read: never a data URL
      // (the bytes are not a name) and never the network.
      if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return Promise.resolve(null)
      let pending = clips.get(src)
      if (!pending) {
        pending = readBinaryBase64(`${root}/${src.replace(/^\.\//, '')}`, MAX_PPTX_VIDEO_BYTES)
          .then(read => ({ base64: read.base64, extn: (src.split(/[?#]/)[0].split('.').pop() ?? 'mp4').toLowerCase() }))
          .catch(() => null)
        clips.set(src, pending)
      }
      return pending
    }
    const frameSize = captured ? deckFrameSize(captured, geometry) : geometry
    for (const [index, instant] of instants.entries()) {
      if (shouldCancel?.()) throw new ExportCancelled()
      const raw = await readBinaryDataUrl(`${framesDir}/${frameFileName(index)}`)
      const dataUrl = captured ? await frameToDeck(raw, captured, geometry) : raw
      const videos: PptxVideo[] = []
      for (const placement of (request.videos ?? []).filter(entry => entry.slide === instant.slide)) {
        const clip = await clipFor(placement.src)
        if (!clip) continue
        // The picture underneath is the clip's first frame; a cover cut
        // from it means nothing changes on screen when the clip starts.
        const cover = await cropDataUrl(dataUrl, placement).catch(() => undefined)
        videos.push({ ...clip, x: placement.x, y: placement.y, w: placement.w, h: placement.h, ...(cover ? { cover } : {}) })
      }
      frames.push({ dataUrl, notes: slides[instant.slide]?.notes, ...(videos.length ? { videos } : {}) })
      report({ phase: 'working', unit: index + 1, unitCount: instants.length, message: `Packing slide ${index + 1} of ${instants.length}…` })
    }
    const base64 = await buildDeckPptx({
      title,
      width: frameSize.width,
      height: frameSize.height,
      frames,
    })
    const outputPath = `${exportsDir}/${stem}.pptx`
    await writeBinaryFile(outputPath, base64)
    try {
      await deletePath(framesDir, true)
    } catch {
      /* the file is written either way */
    }
    report({ phase: 'done', unit: instants.length, message: `Wrote ${outputPath.split('/').pop()}.`, outputPath })
    return { kind, outputPath, units: instants.length }
  }

  if (kind === 'images') {
    // For an image export the frames ARE the artifact — they stay.
    report({
      phase: 'done',
      unit: instants.length,
      message: `Wrote ${instants.length} images.`,
      outputPath: framesDir,
    })
    return { kind, outputPath: framesDir, units: instants.length }
  }

  // Video: encode the captured frames into a real .mp4. When the runtime has
  // no encoder the frame sequence is kept and said plainly — an honest frame
  // folder beats silently producing nothing.
  if (shouldCancel?.()) throw new ExportCancelled()
  if (!canEncodeVideo()) {
    report({
      phase: 'done',
      unit: instants.length,
      message: `Captured ${instants.length} frames. This runtime cannot encode video, so the frame sequence is the output.`,
      outputPath: framesDir,
    })
    return { kind, outputPath: framesDir, units: instants.length }
  }

  report({
    phase: 'working',
    unit: 0,
    unitCount: instants.length,
    message: `Encoding ${instants.length} frames…`,
  })
  const encodeSize = captured ? deckFrameSize(captured, geometry) : geometry
  const bytes = await encodeFramesToMp4(
    instants.length,
    async index => {
      if (shouldCancel?.()) throw new ExportCancelled()
      const raw = await readBinaryDataUrl(`${framesDir}/${frameFileName(index)}`)
      return captured ? frameToDeck(raw, captured, geometry) : raw
    },
    {
      width: encodeSize.width,
      height: encodeSize.height,
      fps: EXPORT_FPS,
      onProgress: index => {
        if (index % EXPORT_FPS === 0 || index === instants.length - 1) {
          report({
            phase: 'working',
            unit: index + 1,
            unitCount: instants.length,
            message: `Encoding frame ${index + 1} of ${instants.length}…`,
          })
        }
      },
    },
  )

  const outputPath = `${exportsDir}/${stem}.mp4`
  await writeBinaryFile(outputPath, base64FromBytes(bytes))

  // The frames were scaffolding for the encode; the .mp4 is the output.
  try {
    await deletePath(framesDir, true)
  } catch {
    /* the video is written either way */
  }

  report({
    phase: 'done',
    unit: instants.length,
    message: `Wrote ${outputPath.split('/').pop()}.`,
    outputPath,
  })
  return { kind, outputPath, units: instants.length }
}

/**
 * Turn the shell's render events into a count that can be trusted.
 *
 * Not every event carries a position — some are only a message — and reading
 * `pct ?? 0` on those reports unit 0, so the count snaps back to the start
 * between real ones. That reads as a stalled export. Two rules: an event with
 * no usable position updates the words and leaves the count alone, and the
 * count never goes backwards.
 */
export function createCaptureProgress(
  total: number,
): (event: { pct?: number; message?: string }) => {
  unit: number
  message: string
} | null {
  let captured = 0
  return event => {
    const pct = event.pct
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      return event.message ? { unit: captured, message: event.message } : null
    }
    captured = Math.max(captured, Math.round(pct * total))
    return {
      unit: captured,
      message: event.message ?? `Captured ${captured} of ${total}`,
    }
  }
}
