/**
 * The one door every deck edit goes through.
 *
 * A deck edit is a pure transform of the document's html — `addSlide`,
 * `setSlideElement`, a model's whole-deck rewrite wrapped as `() => next`.
 * This module names what the kit's `applyEdit` needs to admit one: the hash
 * it was computed against, who is asking, and how a hand edit is rebased
 * when the deck moved underneath it (re-run the transform on the latest
 * document — a transform is a function of html, so that IS the rebase).
 *
 * Everything here is pure. `App` lands the outcome: state, refs, autosave,
 * the revision snapshot the policy asks for, and the status line.
 */
import {
  applyEdit,
  contentHash,
  reasonLabel as kitReasonLabel,
  type EditOrigin,
  type EditRefusal,
  type RevisionEntry,
} from '@purescience/platform-ui/editing'
import { checkDeck } from './checkDeck'

export type DeckEditOrigin = EditOrigin

/** `getDeckContext` returns the hash; this names the tool to re-read with. */
export const DECK_REREAD_HINT =
  'call getDeckContext (or getSlide) again and redo the edit against the current deck, passing the new hash as baseHash'

/** The words a person sees when an ask came back after the deck moved. */
export const STALE_ASK_MESSAGE =
  'The deck changed while the assistant was working, so its rewrite was not applied — nothing you did since was lost. Ask again to redo it against the deck as it is now.'

/** The content hash the door keeps: the deck html, nothing else. */
export function hashDeck(html: string): string {
  return contentHash(html)
}

export interface DeckEditRequest {
  /** The edit, as a function of the html it lands on. */
  transform: (html: string) => string
  origin: DeckEditOrigin
  /**
   * The hash the edit was computed against. Omit for an elementary edit
   * computed synchronously against the live document; agents and the ask
   * path pass the hash they read.
   */
  baseHash?: string
  /** Status-line words once it lands ("Slide moved."). */
  label?: string
  /**
   * Whether a stale hand edit may be re-run on the latest document. True
   * for transforms of html (slide ops, an inline edit by path); false for
   * a whole-text replacement such as the Source dialog, which cannot be
   * merged and is refused instead.
   */
  rebase?: boolean
  /** The revision reason for the snapshot the policy takes ("ask", "draft"…). */
  reason?: string
  /** The scope of the change, for the history entry ("slide 3", "deck"). */
  scope?: string
  /** The request's words, for the text-loss warning's deletion check. */
  request?: string
}

export interface DeckDoorState {
  html: string
  hash: string
}

/** What the host says once it has landed (or refused) an edit — the tool result's shape too. */
export type DeckEditResult =
  | {
      ok: true
      /** The hash after the edit — the base for the next one. */
      hash: string
      changed: boolean
      /** A stale hand edit that was re-run on the latest deck. */
      rebased: boolean
      /** The text-loss warning, when a revision dropped much of the text unasked. */
      warning: string | null
      /** The snapshot taken before a revision, when one was. */
      snapshot: RevisionEntry | null
    }
  | EditRefusal

export type DeckEditPlan =
  | {
      ok: true
      html: string
      hash: string
      changed: boolean
      rebased: boolean
    }
  | EditRefusal

/**
 * Admit an edit against the current deck. A stale agent/ask base is
 * refused with the kit's structured reason; a stale hand edit is re-run on
 * the current html when the request allows it; an edit that produces a
 * document with no deck root is refused as invalid.
 */
export function planDeckEdit(request: DeckEditRequest, current: DeckDoorState): DeckEditPlan {
  const next = request.transform(current.html)
  const rebase = request.rebase === false ? undefined : ({ current: latest }: { current: string }) => request.transform(latest)
  const outcome = applyEdit(
    {
      next,
      ...(request.baseHash !== undefined ? { baseHash: request.baseHash } : {}),
      origin: request.origin,
      ...(request.label ? { label: request.label } : {}),
    },
    { content: current.html, hash: current.hash },
    {
      hashOf: hashDeck,
      validate: validateDeckHtml,
      ...(rebase ? { rebase } : {}),
      rereadHint: DECK_REREAD_HINT,
    },
  )
  if (!outcome.ok) return outcome
  return { ok: true, html: outcome.content, hash: outcome.hash, changed: outcome.changed, rebased: outcome.rebased }
}

/** A document the board cannot show is not a deck: refuse it at the door. */
export function validateDeckHtml(html: string): string | null {
  if (!html || !html.trim()) return 'the deck document is empty'
  const blocking = checkDeck(html).filter(finding => finding.severity === 'error')
  if (!blocking.length) return null
  return `that deck would not render: ${blocking.map(finding => `${finding.message} — ${finding.fix}`).join('; ')}`
}

/** The stale refusal's words, by who is knocking. */
export function refusalWords(origin: DeckEditOrigin, message: string): string {
  return origin === 'ask' ? STALE_ASK_MESSAGE : message
}

/** The snapshot reason for an origin, unless the request names one. */
export function reasonFor(origin: DeckEditOrigin, reason?: string): string {
  if (reason) return reason
  if (origin === 'manual') return 'manual-edit'
  return origin
}

/** What each snapshot is the state BEFORE — the deck's own reasons on top of the kit's. */
export const DECK_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: 'drafting',
  'agent-setDeck': 'a deck rewrite by the agent',
})

export function reasonLabel(reason: string): string {
  return kitReasonLabel(reason, DECK_REASON_LABELS)
}
