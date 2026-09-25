import { describe, expect, it } from 'vitest'
import { snapshotPolicy } from '@purescience/platform-ui/editing'
import {
  DECK_REREAD_HINT,
  STALE_ASK_MESSAGE,
  hashDeck,
  planDeckEdit,
  reasonFor,
  reasonLabel,
  refusalWords,
} from './deckDoor'
import { addSlide, setElementText, slidesFromHtml } from './slides'
import { createDefaultDeckDocument } from './deckDocument'

const base = createDefaultDeckDocument('Door').html
const current = { html: base, hash: hashDeck(base) }

describe('planDeckEdit', () => {
  it('lands an elementary edit against the live deck and names the new hash', () => {
    const plan = planDeckEdit(
      { transform: html => addSlide(html, '<div data-slide><h1>Two</h1></div>'), origin: 'manual' },
      current,
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.changed).toBe(true)
    expect(plan.rebased).toBe(false)
    expect(plan.hash).toBe(hashDeck(plan.html))
    expect(plan.hash).not.toBe(current.hash)
    expect(slidesFromHtml(plan.html)).toHaveLength(2)
  })

  it('reports a no-op edit as unchanged with the same hash', () => {
    const plan = planDeckEdit({ transform: html => html, origin: 'manual' }, current)
    expect(plan.ok && !plan.changed && plan.hash === current.hash).toBe(true)
  })

  it('refuses an agent edit whose base is stale, and says how to re-read', () => {
    const plan = planDeckEdit(
      { transform: html => addSlide(html, '<div data-slide><h1>Late</h1></div>'), origin: 'agent', baseHash: 'deadbeefdeadbeef' },
      current,
    )
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toBe('stale')
    expect(plan.currentHash).toBe(current.hash)
    expect(plan.message).toContain(DECK_REREAD_HINT)
    expect(plan.message).toContain(current.hash)
  })

  it('refuses a stale ask in plain words, with a retry hint', () => {
    const plan = planDeckEdit(
      { transform: () => base, origin: 'ask', baseHash: 'deadbeefdeadbeef' },
      current,
    )
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(refusalWords('ask', plan.message)).toBe(STALE_ASK_MESSAGE)
    expect(STALE_ASK_MESSAGE).toMatch(/Ask again/)
  })

  it('accepts an agent edit whose base is current, and lands it', () => {
    const plan = planDeckEdit(
      { transform: html => addSlide(html, '<div data-slide><h1>On time</h1></div>'), origin: 'agent', baseHash: current.hash },
      current,
    )
    expect(plan.ok).toBe(true)
  })

  it('rebases a stale hand edit by re-running the transform on the latest deck', () => {
    // The person edited the headline while the deck was at `base`; an agent
    // added a slide first. The retype is a function of html, so it re-runs.
    const moved = addSlide(base, '<div data-slide><h1>Agent slide</h1></div>')
    const latest = { html: moved, hash: hashDeck(moved) }
    const plan = planDeckEdit(
      {
        transform: html => setElementText(html, 0, '0', 'Retyped'),
        origin: 'manual',
        baseHash: current.hash,
      },
      latest,
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.rebased).toBe(true)
    const slides = slidesFromHtml(plan.html)
    expect(slides).toHaveLength(2)
    expect(slides[0].headline).toBe('Retyped')
    expect(slides[1].headline).toBe('Agent slide')
  })

  it('refuses a stale whole-text hand edit that cannot be rebased', () => {
    const moved = addSlide(base, '<div data-slide><h1>Agent slide</h1></div>')
    const plan = planDeckEdit(
      { transform: () => base, origin: 'manual', baseHash: current.hash, rebase: false },
      { html: moved, hash: hashDeck(moved) },
    )
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toBe('stale')
    expect(plan.message).toMatch(/changed while you were editing/)
  })

  it('refuses a document with no deck root as invalid', () => {
    const plan = planDeckEdit({ transform: () => '<html><body><p>not a deck</p></body></html>', origin: 'agent' }, current)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toBe('invalid')
    expect(plan.message).toMatch(/deck root/)
  })
})

describe('snapshot policy wiring', () => {
  it('snapshots before an ask and arms the first hand edit after it', () => {
    const afterAsk = snapshotPolicy('ask', false, true)
    expect(afterAsk).toEqual({ snapshot: 'before-revision', armed: true })
    const firstHand = snapshotPolicy('manual', afterAsk.armed, true)
    expect(firstHand).toEqual({ snapshot: 'first-manual-after-revision', armed: false })
    expect(snapshotPolicy('manual', firstHand.armed, true).snapshot).toBeNull()
  })

  it('never snapshots an edit that changed nothing', () => {
    expect(snapshotPolicy('agent', false, false).snapshot).toBeNull()
  })

  it('names the snapshot reason from the origin unless the request names one', () => {
    expect(reasonFor('ask')).toBe('ask')
    expect(reasonFor('agent')).toBe('agent')
    expect(reasonFor('manual')).toBe('manual-edit')
    expect(reasonFor('ask', 'draft')).toBe('draft')
    expect(reasonLabel('draft')).toBe('drafting')
    expect(reasonLabel('agent')).toBe('agent update')
  })
})
