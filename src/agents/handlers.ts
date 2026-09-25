/**
 * The drawer agent's half of every pair.
 *
 * Each handler validates, then calls the app's own callback — the same one
 * the button calls. A tool that wrote the document directly would be a second
 * path to the same state, and the two would drift.
 */
import {
  agentToolErrorContent,
  formatAgentToolJson,
  readAgentToolStringArg,
} from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { checkDeck } from '../lib/checkDeck'
import {
  createDefaultDeckDocument,
  geometryFromHtml,
} from '../lib/deckDocument'
import type { DeckEditResult } from '../lib/deckDoor'
import { slidesFromHtml } from '../lib/slides'
import type { AssetRole } from '../lib/assetNotes'
import type { DeckAgentToolContext, EditOptions } from './catalog'

const ROLES = ['content', 'reference', 'logo']
const PATH = /^\d+(\.\d+)*$/

/** The hash the agent read the deck at, when it says so. */
function editOptions(args: Record<string, unknown>): EditOptions {
  const baseHash = readAgentToolStringArg(args, 'baseHash')?.trim()
  return baseHash ? { baseHash } : {}
}

/**
 * What every mutating tool answers: the door's refusal verbatim (a stale
 * base says how to re-read; an invalid deck says what is wrong), or the
 * new hash to carry into the next edit — with the text-loss warning when a
 * revision dropped much of the text unasked.
 */
function landed(
  result: DeckEditResult,
  extra: Record<string, unknown>,
): AgentToolHandlerResult {
  if (!result.ok) {
    return agentToolErrorContent(
      result.reason === 'stale'
        ? `${result.message}. currentHash: ${result.currentHash}`
        : result.message,
    )
  }
  return {
    content: formatAgentToolJson({
      ...extra,
      hash: result.hash,
      changed: result.changed,
      ...(result.warning
        ? {
            textRemoved: `${result.warning} If the user did not ask for that much to go, call restoreRevision with file "${result.snapshot?.file ?? ''}" and redo the edit carrying the content forward.`,
          }
        : {}),
    }),
  }
}

function slideIndexOf(
  context: DeckAgentToolContext,
  value: unknown,
  key = 'index',
): number | AgentToolHandlerResult {
  const index = Number(value)
  const slides = slidesFromHtml(context.document.html)
  if (!Number.isInteger(index) || index < 0 || !slides[index]) {
    return agentToolErrorContent(
      `${key} must be a slide number from listSlides — the deck has ${slides.length}`,
    )
  }
  return index
}

export function getDeckContextHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  const { ui } = context
  // What "this" means, resolved here rather than guessed downstream.
  const aim = ui.elementSelection.length
    ? {
        scope: 'elements' as const,
        slideIndex: ui.selectedSlide,
        elements: ui.elementSelection,
      }
    : ui.slideSelection.length > 1
      ? { scope: 'slides' as const, slideIndexes: ui.slideSelection }
      : { scope: 'slide' as const, slideIndex: ui.selectedSlide }

  return {
    content: formatAgentToolJson({
      ...context.summarize(),
      // The base every edit names. Pass it as baseHash; a stale one is
      // refused with the current hash and this is the tool to re-read with.
      hash: context.hash,
      verification: {
        state: context.verification.state,
        message: context.verification.message,
        ...(context.verification.failedSlides.length
          ? { overlappingSlides: context.verification.failedSlides }
          : {}),
        ...(context.verification.checkingSlides.length
          ? { slidesBeingChecked: context.verification.checkingSlides }
          : {}),
      },
      revisions: context.listRevisions().length,
      documentPath: context.documentPath,
      view: ui.view,
      brief: ui.brief,
      targetSlides: ui.slideCount,
      exporting: context.exporting,
      lastExportPath: context.lastExportPath,
      assets: context.material.map(item => ({
        reference: item.reference,
        role: item.role ?? 'content',
        description: item.description,
      })),
      // A request that says "this" or "these" means whatever is aimed at
      // here. Act on `aim` rather than assuming the whole deck.
      aim,
    }),
  }
}

export function getSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  if (args.index === undefined) {
    return {
      content: formatAgentToolJson({
        documentPath: context.documentPath,
        hash: context.hash,
        geometry: geometryFromHtml(context.document.html),
        html: context.document.html,
      }),
    }
  }
  const index = slideIndexOf(context, args.index)
  if (typeof index !== 'number') return index
  if (typeof DOMParser === 'undefined') {
    return agentToolErrorContent('cannot read the deck in this runtime')
  }
  const doc = new DOMParser().parseFromString(context.document.html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  const slides = [...(root?.children ?? [])].filter(child =>
    child.matches('[data-slide]'),
  )
  const slide = slides[index] ?? root
  return {
    content: formatAgentToolJson({ index, hash: context.hash, html: slide?.outerHTML ?? '' }),
  }
}

export function listSlidesHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  const slides = slidesFromHtml(context.document.html)
  return {
    content: formatAgentToolJson({
      documentPath: context.documentPath,
      hash: context.hash,
      slides: slides.map(slide => ({
        index: slide.index,
        headline: slide.headline,
        support: slide.support,
        notes: slide.notes,
        block: slide.block,
        steps: slide.steps,
        seconds: slide.seconds,
        ...(slide.asset ? { asset: slide.asset } : {}),
        ...(slide.synthetic ? { synthetic: true } : {}),
      })),
      note: 'steps is how many presses the slide takes; 0 means everything is on at once',
    }),
  }
}

export async function listAssetsHandler(
  context: DeckAgentToolContext,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) {
    return agentToolErrorContent('there is no deck open — create one first')
  }
  try {
    const files = await context.listAssets()
    const byName = new Map(context.material.map(item => [item.name, item]))
    return {
      content: formatAgentToolJson({
        documentPath: context.documentPath,
        assets: files.map(file => ({
          ...file,
          reference: `assets/${file.name}`,
          role: byName.get(file.name)?.role ?? 'content',
          description: byName.get(file.name)?.description ?? '',
        })),
        note: 'a file whose role is "reference" is a design reference: build the look from it and never place it on a slide',
      }),
    }
  } catch (error) {
    return agentToolErrorContent(
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function checkDeckHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  const findings = checkDeck(context.document.html)
  return {
    content: formatAgentToolJson({
      clean: findings.length === 0 && context.verification.state === 'verified',
      findings,
      layout: {
        state: context.verification.state,
        message: context.verification.message,
        ...(context.verification.failedSlides.length
          ? { overlappingSlides: context.verification.failedSlides }
          : {}),
      },
      note:
        context.verification.state === 'checking'
          ? 'the layout is measured as slides render; export measures every slide again first and refuses if any is not verified'
          : context.verification.state === 'failed'
            ? 'overlapping text is a fault in the slide, not the view — scaling cannot fix it; change the layout, then export'
            : 'every slide measured cleanly with its fonts loaded',
    }),
  }
}

export async function createDeckHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const title = readAgentToolStringArg(args, 'title')?.trim()
  if (!title) return agentToolErrorContent('title is required')
  try {
    const path = await context.createAndOpen(createDefaultDeckDocument(title))
    return { content: formatAgentToolJson({ created: true, title, path }) }
  } catch (error) {
    return agentToolErrorContent(
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function setDeckHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const html = readAgentToolStringArg(args, 'html')
  if (!html || !html.trim().startsWith('<')) {
    return agentToolErrorContent('html must be a complete deck document')
  }
  const findings = checkDeck(html)
  const blocking = findings.filter(finding => finding.severity === 'error')
  if (blocking.length) {
    return agentToolErrorContent(
      `that deck would not render: ${blocking.map(f => f.message).join('; ')}`,
    )
  }
  const width = args.width === undefined ? undefined : Number(args.width)
  const height = args.height === undefined ? undefined : Number(args.height)
  const result = context.applyDeck(
    html,
    width || height ? { ...(width ? { width } : {}), ...(height ? { height } : {}) } : undefined,
    readAgentToolStringArg(args, 'title') ?? undefined,
    editOptions(args),
  )
  return landed(result, { replaced: true })
}

export function addSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const html = readAgentToolStringArg(args, 'html')?.trim()
  if (!html || !html.startsWith('<')) {
    return agentToolErrorContent('html must be a single element carrying data-slide')
  }
  const at = args.atIndex === undefined ? undefined : Number(args.atIndex)
  if (at !== undefined && (!Number.isInteger(at) || at < 0)) {
    return agentToolErrorContent('atIndex must be a slide number')
  }
  return landed(context.slideOps.add(html, at, editOptions(args)), { added: true, atIndex: at ?? 'end' })
}

export function updateSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const index = slideIndexOf(context, args.index)
  if (typeof index !== 'number') return index
  const patch: Record<string, unknown> = {}
  for (const key of ['headline', 'support', 'notes', 'block', 'asset']) {
    const value = readAgentToolStringArg(args, key)
    if (value !== null && value !== undefined) patch[key] = value
  }
  if (args.seconds !== undefined) {
    const seconds = Number(args.seconds)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return agentToolErrorContent('seconds must be a positive number')
    }
    patch.seconds = seconds
  }
  if (!Object.keys(patch).length) {
    return agentToolErrorContent('nothing to change')
  }
  return landed(context.slideOps.update(index, patch, editOptions(args)), { index, ...patch })
}

export function setSlideHtmlHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const index = slideIndexOf(context, args.index)
  if (typeof index !== 'number') return index
  const html = readAgentToolStringArg(args, 'html')?.trim()
  if (!html || !html.startsWith('<')) {
    return agentToolErrorContent('html must be a single element')
  }
  return landed(context.slideOps.setHtml(index, html, editOptions(args)), { index, replaced: true })
}

export function moveSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const from = slideIndexOf(context, args.from, 'from')
  if (typeof from !== 'number') return from
  const to = slideIndexOf(context, args.to, 'to')
  if (typeof to !== 'number') return to
  if (from === to) return agentToolErrorContent('the slide is already there')
  return landed(context.slideOps.move(from, to, editOptions(args)), { from, to })
}

export function duplicateSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const index = slideIndexOf(context, args.index)
  if (typeof index !== 'number') return index
  return landed(context.slideOps.duplicate(index, editOptions(args)), { duplicated: index })
}

export function deleteSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const index = slideIndexOf(context, args.index)
  if (typeof index !== 'number') return index
  if (slidesFromHtml(context.document.html).length <= 1) {
    return agentToolErrorContent(
      'that is the last slide — a deck keeps at least one',
    )
  }
  return landed(context.slideOps.remove(index, editOptions(args)), { deleted: index })
}

function elementArgs(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): { index: number; path: string } | AgentToolHandlerResult {
  const index = slideIndexOf(context, args.slideIndex, 'slideIndex')
  if (typeof index !== 'number') return index
  const path = readAgentToolStringArg(args, 'path') ?? ''
  if (!PATH.test(path)) {
    return agentToolErrorContent(
      'path must be a chain of child indexes such as "0.2" — getDeckContext reports the ones the author picked',
    )
  }
  return { index, path }
}

export function setElementHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const target = elementArgs(context, args)
  if (!('index' in target)) return target
  const html = readAgentToolStringArg(args, 'html')?.trim()
  if (!html || !html.startsWith('<')) {
    return agentToolErrorContent('html must be a single element')
  }
  return landed(context.setElement(target.index, target.path, html, editOptions(args)), { ...target, replaced: true })
}

export function deleteElementHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const target = elementArgs(context, args)
  if (!('index' in target)) return target
  if (!target.path) {
    return agentToolErrorContent(
      'that path addresses the slide itself — use deleteSlide to remove a whole slide',
    )
  }
  return landed(context.deleteElement(target.index, target.path, editOptions(args)), { ...target, deleted: true })
}

export function setElementStepHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const target = elementArgs(context, args)
  if (!('index' in target)) return target
  const step = Number(args.step)
  if (!Number.isInteger(step) || step < 0) {
    return agentToolErrorContent('step must be 0 or more — 0 shows it from the start')
  }
  return landed(context.setElementStep(target.index, target.path, step, editOptions(args)), {
    ...target,
    step,
    ...(step > 0
      ? { note: `arrives on press ${step}` }
      : { note: 'on from the start' }),
  })
}

export async function addAssetHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const sourcePath = readAgentToolStringArg(args, 'sourcePath')?.trim()
  if (!sourcePath) return agentToolErrorContent('sourcePath is required')
  if (!context.documentPath) {
    return agentToolErrorContent('there is no deck open — create one first')
  }
  const name = readAgentToolStringArg(args, 'name')?.trim()
  if (name && /[\\/]/.test(name)) {
    return agentToolErrorContent(
      'name must be a file name, not a path — assets live directly in assets/',
    )
  }
  const role = readAgentToolStringArg(args, 'role')?.trim()
  if (role && !ROLES.includes(role)) {
    return agentToolErrorContent(`role must be one of ${ROLES.join(', ')}`)
  }
  try {
    const reference = await context.addAsset(sourcePath, name || undefined)
    if (role && role !== 'content') {
      context.setAssetRole(reference.replace(/^assets\//, ''), role as AssetRole)
    }
    return {
      content: formatAgentToolJson({ added: true, reference, role: role || 'content' }),
    }
  } catch (error) {
    return agentToolErrorContent(
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function setAssetRoleHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const name = readAgentToolStringArg(args, 'name')?.trim()
  if (!name) return agentToolErrorContent('name is required')
  const role = readAgentToolStringArg(args, 'role')?.trim()
  if (!role || !ROLES.includes(role)) {
    return agentToolErrorContent(`role must be one of ${ROLES.join(', ')}`)
  }
  if (!context.material.some(item => item.name === name)) {
    return agentToolErrorContent(
      `${name} is not attached to this deck — add it first`,
    )
  }
  context.setAssetRole(name, role as AssetRole)
  return {
    content: formatAgentToolJson({
      name,
      role,
      ...(role === 'reference'
        ? { note: 'drafting will build the look from this file and never place it on a slide' }
        : {}),
    }),
  }
}

export function describeAssetHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const name = readAgentToolStringArg(args, 'name')?.trim()
  if (!name) return agentToolErrorContent('name is required')
  const description = readAgentToolStringArg(args, 'description') ?? null
  if (description === null) {
    return agentToolErrorContent('description is required')
  }
  if (!context.material.some(item => item.name === name)) {
    return agentToolErrorContent(
      `${name} is not attached to this deck — add it first`,
    )
  }
  context.describeAsset(name, description.trim())
  return { content: formatAgentToolJson({ name, description: description.trim() }) }
}

export function setBriefHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const briefArg = readAgentToolStringArg(args, 'brief')
  const brief = briefArg === null ? undefined : briefArg
  const slides = args.slides === undefined ? undefined : Number(args.slides)
  if (slides !== undefined && (!Number.isFinite(slides) || slides <= 0)) {
    return agentToolErrorContent('slides must be a positive number')
  }
  if (brief === undefined && slides === undefined) {
    return agentToolErrorContent('give a brief, a slide count, or both')
  }
  context.setBrief({
    ...(brief === undefined ? {} : { brief }),
    ...(slides === undefined ? {} : { slides }),
  })
  return {
    content: formatAgentToolJson({
      brief: brief ?? context.ui.brief,
      slides: slides ?? context.ui.slideCount,
    }),
  }
}

export async function draftDeckHandler(
  context: DeckAgentToolContext,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) {
    return agentToolErrorContent('there is no deck open — create one first')
  }
  if (!context.ui.brief.trim() && !context.material.length) {
    return agentToolErrorContent(
      'there is nothing to draft from — set a brief with setBrief, or attach files with addAsset',
    )
  }
  try {
    const result = await context.draftDeck()
    return { content: formatAgentToolJson(result) }
  } catch (error) {
    return agentToolErrorContent(
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function setSelectionHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const slides = slidesFromHtml(context.document.html)
  const patch: Parameters<DeckAgentToolContext['setSelection']>[0] = {}

  if (args.selectedSlide !== undefined) {
    const index = Number(args.selectedSlide)
    if (!Number.isInteger(index) || !slides[index]) {
      return agentToolErrorContent(
        `selectedSlide must be one of 0..${Math.max(0, slides.length - 1)}`,
      )
    }
    patch.selectedSlide = index
  }
  if (args.slideIndexes !== undefined) {
    if (!Array.isArray(args.slideIndexes)) {
      return agentToolErrorContent('slideIndexes must be an array of slide numbers')
    }
    const indexes = args.slideIndexes.map(Number)
    if (indexes.some(index => !Number.isInteger(index) || !slides[index])) {
      return agentToolErrorContent('slideIndexes must all be slides that exist')
    }
    patch.slideIndexes = [...new Set(indexes)].sort((a, b) => a - b)
  }
  if (args.elementPaths !== undefined) {
    if (!Array.isArray(args.elementPaths)) {
      return agentToolErrorContent('elementPaths must be an array of paths')
    }
    const paths = args.elementPaths.map(String)
    if (paths.some(path => !PATH.test(path))) {
      return agentToolErrorContent('each path is a chain of child indexes such as "0.2"')
    }
    patch.elementPaths = paths
  }
  const view = readAgentToolStringArg(args, 'view')?.trim()
  if (view) {
    if (!['slides', 'assets'].includes(view)) {
      return agentToolErrorContent('view must be slides or assets')
    }
    patch.view = view
  }
  if (!Object.keys(patch).length) return agentToolErrorContent('nothing to select')
  context.setSelection(patch)
  return { content: formatAgentToolJson({ ...patch, selected: true }) }
}

export function presentHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const slides = slidesFromHtml(context.document.html)
  if (!slides.length) return agentToolErrorContent('the deck has no slides')
  const from = args.fromSlide === undefined ? 0 : Number(args.fromSlide)
  if (!Number.isInteger(from) || !slides[from]) {
    return agentToolErrorContent(
      `fromSlide must be one of 0..${slides.length - 1}`,
    )
  }
  context.present(from)
  return { content: formatAgentToolJson({ presenting: true, fromSlide: from }) }
}

export async function saveDeckHandler(
  context: DeckAgentToolContext,
): Promise<AgentToolHandlerResult> {
  const path = await context.saveDeck()
  return { content: formatAgentToolJson({ artifactPaths: [path] }) }
}

export async function exportDeckHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  if (context.exporting) {
    return agentToolErrorContent('an export is already running')
  }
  const kind = readAgentToolStringArg(args, 'kind')?.trim()
  if (!kind || !['pdf', 'images', 'video', 'pptx'].includes(kind)) {
    return agentToolErrorContent('kind must be pdf, images, video or pptx')
  }
  // No pre-check here: the pipeline itself measures every slide again and
  // refuses an unverified or blocked deck, so this tool cannot bypass it.
  try {
    const outputPath = await context.runExport(
      kind as 'pdf' | 'images' | 'video' | 'pptx',
      args.notesAppendix === true,
    )
    return {
      content: formatAgentToolJson({
        exported: kind,
        outputPath,
        artifactPaths: [outputPath],
      }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const refused = error instanceof Error && error.name === 'ExportRefused'
    return agentToolErrorContent(
      refused
        ? `export refused — ${message} (checkDeck reports the layout state; fix the slides it names, or wait for the check to finish, then call exportDeck again)`
        : message,
    )
  }
}

export function stopExportHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  if (!context.exporting) {
    return {
      content: formatAgentToolJson({ stopped: false, reason: 'no export is running' }),
    }
  }
  return {
    content: formatAgentToolJson({
      stopped: context.stopExport(),
      note: 'the export halts after the page or frame in flight',
    }),
  }
}

export function setElementTextHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const target = elementArgs(context, args)
  if (!('index' in target)) return target
  if (!target.path) {
    return agentToolErrorContent(
      'that path addresses the slide itself — use updateSlide for a slide\'s copy',
    )
  }
  const text = readAgentToolStringArg(args, 'text')
  if (text === null || text === undefined) {
    return agentToolErrorContent('text is required')
  }
  const result = context.setElementText(target.index, target.path, text, editOptions(args))
  return landed(result, {
    ...target,
    text,
    note:
      result.ok && !result.changed
        ? 'nothing changed — an element holding other elements cannot be retyped, since that would delete them'
        : undefined,
  })
}

export function listBlocksHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  return {
    content: formatAgentToolJson({
      blocks: context.blocks,
      note: 'addBlock adds one as a new slide; it is a starting point, then edit it like any other slide',
    }),
  }
}

export function addBlockHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): AgentToolHandlerResult {
  const blockId = readAgentToolStringArg(args, 'blockId')?.trim()
  if (!blockId) return agentToolErrorContent('blockId is required')
  const at = args.atIndex === undefined ? undefined : Number(args.atIndex)
  if (at !== undefined && (!Number.isInteger(at) || at < 0)) {
    return agentToolErrorContent('atIndex must be a slide number')
  }
  const asset = readAgentToolStringArg(args, 'asset')?.trim()
  if (asset && /[\/]/.test(asset)) {
    return agentToolErrorContent(
      'asset must be a file name inside assets/, not a path — addAsset the clip first, then name it here',
    )
  }
  const block = context.blocks.find(entry => entry.id === blockId)
  if (asset && block && block.media !== 'video') {
    return agentToolErrorContent(
      `"${blockId}" has no video slot — the video blocks are ${context.blocks.filter(entry => entry.media === 'video').map(entry => entry.id).join(' and ')}`,
    )
  }
  const result = context.addBlock(blockId, at, editOptions(args), asset ? { asset } : undefined)
  if (!result) {
    return agentToolErrorContent(
      `no block called "${blockId}" — listBlocks has the ones on offer`,
    )
  }
  return landed(result, { added: blockId, atIndex: at ?? 'end', ...(asset ? { asset: `assets/${asset}` } : {}) })
}

export function listRevisionsHandler(
  context: DeckAgentToolContext,
): AgentToolHandlerResult {
  const entries = context.listRevisions()
  return {
    content: formatAgentToolJson({
      documentPath: context.documentPath,
      hash: context.hash,
      revisions: entries.map(entry => ({
        file: entry.file,
        at: entry.at,
        reason: entry.reason,
        ...(entry.scope ? { scope: entry.scope } : {}),
        byteSize: entry.byteSize,
        textChars: entry.textChars,
      })),
      note: entries.length
        ? 'Each entry is the deck AS IT WAS before the change its reason names, newest first. restoreRevision puts one back (the current deck is snapshotted first, so a restore is itself undoable).'
        : 'no revisions yet — one is kept before every ask, agent update, draft and restore',
    }),
  }
}

export async function restoreRevisionHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const file = readAgentToolStringArg(args, 'file')?.trim()
  if (!file) return agentToolErrorContent('file is required — listRevisions reports the names')
  const result = await context.restoreRevision(file)
  if ('error' in result) return agentToolErrorContent(result.error)
  return landed(result, { restored: file })
}
