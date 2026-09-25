/**
 * Is what the board shows what the room will see?
 *
 * Every frame that renders a slide already measures it — `fitSlide` scales
 * an overflowing slide to fit and records the content collisions it could
 * not separate. This module turns that into the kit's verification state,
 * per slide and for the deck:
 *
 *   - a slide measured in a frame with no geometry (a hidden tab, an
 *     occluded window) or before its fonts finished loading is `checking`,
 *     never `verified` — zero overflow in a dead frame means nothing;
 *   - a slide measured cleanly whose content still overlaps is `failed`,
 *     with the slide named;
 *   - a slide nobody has measured yet (the strip is not on screen, or the
 *     html changed since) is `checking`.
 *
 * The deck is verified only when every slide is.
 */
import {
  renderFingerprint,
  verify,
  type FontsStatus,
  type Verification,
  type VerificationState,
} from '@purescience/platform-ui/editing'
import { SEEK_ENGINE } from './slideSeek'
import type { DeckGeometry } from './deckDocument'

/** What one frame reported after rendering one slide. */
export interface SlideEvidence {
  /** `hashDeck` of the html the frame rendered. */
  hash: string
  /** The deck root had a non-zero box and the document was not hidden. */
  measured: boolean
  fontsStatus: FontsStatus
  /** The frame's `fontsSignature` — the faces it knew when it measured. */
  fontsSignature: string
  /** Content collisions the fit could not separate. */
  overlaps: number
  /** The fingerprint the render was measured under. */
  fingerprint: string
}

export type SlideEvidenceMap = Readonly<Record<number, SlideEvidence>>

/** What a frame posts after rendering a slide (`pureslides:layout`). */
export interface LayoutReport {
  /** The build step the frame rendered — only a full-step render is evidence. */
  step: number
  overlaps: number
  measured: boolean
  fontsStatus: FontsStatus
  fontsSignature: string
}

/** A frame's report, pinned to the html it rendered and the box it rendered in. */
export function evidenceFrom(report: LayoutReport, hash: string, geometry: DeckGeometry): SlideEvidence {
  return {
    hash,
    measured: report.measured,
    fontsStatus: report.fontsStatus,
    fontsSignature: report.fontsSignature,
    overlaps: report.overlaps,
    fingerprint: slideFingerprint(geometry, report.fontsSignature),
  }
}

/** Read the frame's message tolerantly — an older frame reports overlaps alone. */
export function layoutReportFrom(data: {
  step?: unknown
  overlaps?: unknown
  measured?: unknown
  fonts?: unknown
  fontsSignature?: unknown
}): LayoutReport {
  const overlaps = Array.isArray(data.overlaps) ? data.overlaps.length : Number(data.overlaps) || 0
  const fonts = data.fonts
  return {
    step: Number(data.step) || 0,
    overlaps,
    measured: data.measured === true,
    fontsStatus: fonts === 'loaded' || fonts === 'unavailable' ? fonts : 'loading',
    fontsSignature: typeof data.fontsSignature === 'string' ? data.fontsSignature : '',
  }
}

/** The conditions a slide render depends on: its frame box, its fonts, the seek engine. */
export function slideFingerprint(geometry: DeckGeometry, fontsSignature: string, dpr?: number): string {
  return renderFingerprint({
    surface: { kind: 'frame', width: geometry.width, height: geometry.height },
    fonts: fontsSignature,
    ...(dpr !== undefined ? { dpr } : {}),
    engine: SEEK_ENGINE,
  })
}

/** One slide's state from its latest evidence, against the deck as it is now. */
export function verifySlide(
  evidence: SlideEvidence | undefined,
  currentHash: string,
  geometry: DeckGeometry,
): Verification {
  if (!evidence) return { state: 'checking', reasons: ['hidden-frame'] }
  return verify({
    measured: evidence.measured,
    fontsStatus: evidence.fontsStatus,
    fingerprint: evidence.fingerprint,
    currentFingerprint: slideFingerprint(geometry, evidence.fontsSignature, dprOf(evidence.fingerprint)),
    contentHash: evidence.hash,
    currentHash,
    passed: evidence.overlaps === 0,
  })
}

/** Read the dpr a fingerprint was made with, so a comparison is about geometry and fonts only. */
function dprOf(fingerprint: string): number | undefined {
  const match = /\|dpr([0-9.]+)/.exec(fingerprint)
  return match ? Number(match[1]) : undefined
}

export interface DeckVerification {
  state: VerificationState
  /** 1-based slide numbers whose content overlaps. */
  failedSlides: number[]
  /** 1-based slide numbers still being checked. */
  checkingSlides: number[]
  /** People words for the header and the status line. */
  message: string
}

const VERIFIED_WORDS = 'Layout checked'
const CHECKING_WORDS = 'Layout being checked'

function slideList(numbers: number[]): string {
  return `${numbers.length === 1 ? 'Slide' : 'Slides'} ${numbers.join(', ')}`
}

/** The deck's state: verified only when every slide is; failed names the slides. */
export function verifyDeck(
  slideCount: number,
  evidence: SlideEvidenceMap,
  currentHash: string,
  geometry: DeckGeometry,
): DeckVerification {
  const failedSlides: number[] = []
  const checkingSlides: number[] = []
  for (let index = 0; index < slideCount; index += 1) {
    const result = verifySlide(evidence[index], currentHash, geometry)
    if (result.state === 'failed') failedSlides.push(index + 1)
    else if (result.state === 'checking') checkingSlides.push(index + 1)
  }
  if (slideCount === 0) {
    return { state: 'checking', failedSlides, checkingSlides, message: CHECKING_WORDS }
  }
  if (checkingSlides.length) {
    return { state: 'checking', failedSlides, checkingSlides, message: CHECKING_WORDS }
  }
  if (failedSlides.length) {
    return {
      state: 'failed',
      failedSlides,
      checkingSlides,
      message: `${slideList(failedSlides)} ${failedSlides.length === 1 ? 'has' : 'have'} overlapping text`,
    }
  }
  return { state: 'verified', failedSlides, checkingSlides, message: VERIFIED_WORDS }
}

/** What the export guard says when the deck failed: the slides, and what to do. */
export function exportFailedWords(verification: DeckVerification): string {
  if (!verification.failedSlides.length) return 'The layout did not pass its check — review the reported problems before exporting.'
  return `${slideList(verification.failedSlides)} ${verification.failedSlides.length === 1 ? 'has' : 'have'} overlapping text — scaling cannot fix that, so the export was not run. Change the layout of ${verification.failedSlides.length === 1 ? 'that slide' : 'those slides'} and export again.`
}
