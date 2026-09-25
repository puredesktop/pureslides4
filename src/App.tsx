import { useVideoDrop, useImageDrop } from '@purescience/platform-ui/bridge/react/useVideoDrop'
import { imageTransferMarkup } from '@purescience/platform-ui/bridge/imageTransfer'
import { videoEmbedMarkup } from '@purescience/platform-ui/bridge/videoTransfer'
import { insertVideoEmbed } from './lib/slides'
/**
 * PureSlides4.
 *
 * The board IS the app: two panes (Slides, Assets) inside one surface, with
 * the wizard, presenting, export and the raw markup as moments over it rather
 * than places to go. Every capability ships as a pair — a control a person
 * uses and a tool the drawer agent calls that changes the same state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { usePlatformViewportResource } from '@purescience/platform-ui/bridge/react/usePlatformViewportResource'
import { useDocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import {
  DocumentHeaderActions,
  DocumentSwitcher,
} from '@purescience/platform-ui/components/common/documents'
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import { SlideBoardView } from './components/SlideBoardView'
import { AssetsPane } from './components/AssetsPane'
import { NewDeckWizard } from './components/NewDeckWizard'
import { PresentWindow } from './components/PresentWindow'
import { ExportDialog } from './components/ExportDialog'
import { HtmlDialog } from './components/HtmlDialog'
import { HistoryDialog } from './components/HistoryDialog'
import type { StatusAction } from './components/SlideBoardView'
import { usePureSlidesAgentTools } from './hooks/usePureSlidesAgentTools'
import {
  createRevisionHistory,
  isRevisionOrigin,
  preservationWarning,
  snapshotPolicy,
  visibleTextChars,
  type HistoryFs,
  type RevisionEntry,
  type RevisionIndex,
  EMPTY_REVISION_INDEX,
} from '@purescience/platform-ui/editing'
import {
  hashDeck,
  planDeckEdit,
  reasonFor,
  reasonLabel,
  refusalWords,
  type DeckEditRequest,
  type DeckEditResult,
} from './lib/deckDoor'
import {
  evidenceFrom,
  exportFailedWords,
  verifyDeck,
  type LayoutReport,
  type SlideEvidence,
  type SlideEvidenceMap,
} from './lib/deckVerification'
import { measureDeck } from './lib/measureDeck'
import { kindOf } from './lib/material'
import { inlineAssetUrls, picturesOnly, previewCapFor, referencedAssetNames } from './lib/packageAssets'
import { hasVideo, measureVideoPlacements } from './lib/videoPlacements'
import {
  AUTOSAVE_DELAY_MS,
  DECK_APP_SLUG,
  DECK_ASSETS_DIR,
  DECK_EXPORT_DIR,
  DECK_FILE,
  DECK_MANIFEST_FILE,
  DECK_PACKAGE_SUFFIX,
  DEFAULT_LOOK,
  DEFAULT_SLIDE_COUNT,
} from './constants'
import {
  DEFAULT_DECK_TITLE,
  createDefaultDeckDocument,
  createStarterSlideHtml,
  geometryFromHtml,
  isDefaultDeckTitle,
  parsePackageManifest,
  serializePackageManifest,
  summarizeDeck,
  withGeometry,
} from './lib/deckDocument'
import type { DeckDocument } from './lib/deckDocument'
import type { AssetNote, AssetRole } from './lib/assetNotes'
import {
  addSlide,
  clearSlides,
  deleteSlide,
  deleteSlideElement,
  duplicateSlide,
  isUntouchedStarter,
  labelForPath,
  moveSlide,
  setElementStep,
  setElementSrc,
  setElementText,
  setSlideContent,
  setSlideElement,
  slidesFromHtml,
} from './lib/slides'
import { blockCatalogue, blockHtmlWith, findBlock, type BlockFill } from './lib/blocks'
import type { SlideEdit } from './lib/slides'
import {
  assertScope,
  digest,
  requestSession,
  descriptionState,
  assertDescriptionScope,
  type DrawerRequest,
} from './lib/drawerRequest'
import { messages, sessions } from '@purescience/platform-ui/bridge/assistants'
import {
  updateCurrentWorkspaceTab,
  toggleAgentDrawer,
} from '@purescience/platform-ui/bridge/workspace'
import { deckDesignGuide } from './lib/draftDeck'
import type { ReferenceImage } from './lib/draftDeck'
import { mergeMaterial, notesFrom } from './lib/material'
import type { MaterialItem } from './lib/material'
import {
  ExportCancelled,
  assertDeckExportable,
  exportDeck,
} from './lib/exportDeck'
import { base64FromBytes } from './lib/encodeMp4'
import type { ExportKind, ExportProgressState } from './lib/exportDeck'
import {
  cancelShellRender,
  isStandaloneDevMode,
  createFolder,
  deletePath,
  listFiles,
  readBinaryBase64,
  readBinaryDataUrl,
  readTextFile,
  recordOperation,
  revealPath,
  writeBinaryFile,
  writeTextFile,
} from './bridge/platformBridge'
import type { BoardTab, PickedElement } from './types'

const IDLE_PROGRESS: ExportProgressState = {
  phase: 'idle',
  unit: 0,
  unitCount: 0,
  message: '',
}

function fileNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

/** The kit's revision store over the bridge fs — `history/` inside the package. */
const historyFs: HistoryFs = {
  read: readTextFile,
  write: writeTextFile,
  remove: path => deletePath(path, false),
  list: async dir => {
    const listing = (await listFiles(dir)) as {
      entries?: { name?: string; isDirectory?: boolean }[]
    }
    return (listing?.entries ?? [])
      .filter(entry => entry?.name && !entry.isDirectory)
      .map(entry => entry.name as string)
  },
  mkdir: async dir => {
    const at = dir.lastIndexOf('/')
    try {
      await createFolder(dir.slice(0, at), dir.slice(at + 1))
    } catch {
      /* already there */
    }
  },
}

/** How long after a history write to ignore the watcher's echo of it. */

function deckTitleFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.deck$/i, '') || DEFAULT_DECK_TITLE
}

export function App(): React.ReactElement {
  const { ready, meta } = usePlatformBridge()
  const drawerRequestRef = useRef<DrawerRequest | null>(null)
  const drawerCommitBusy = useRef(false)
  const standaloneDev = isStandaloneDevMode()
  const appReady = ready || standaloneDev
  const { resource: viewportResource, clearResource } =
    usePlatformViewportResource(ready && !standaloneDev, meta)

  const [document, setDocument] = useState<DeckDocument>(() =>
    createDefaultDeckDocument(),
  )
  const [documentPath, setDocumentPath] = useState<string | null>(null)
  const [documentStarted, setDocumentStarted] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [boardTab, setBoardTab] = useState<BoardTab>('slides')
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [slideSelection, setSlideSelection] = useState<number[]>([])
  const [elementSelection, setElementSelection] = useState<PickedElement[]>([])
  const [asking, setAsking] = useState(false)

  const [material, setMaterial] = useState<MaterialItem[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const previewsRef = useRef<Record<string, string>>({})
  previewsRef.current = previews
  /** Clips the package could not give the frames, by path — asked once, not per edit. */
  const unreadableClipsRef = useRef(new Set<string>())
  const [brief, setBrief] = useState('')
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDE_COUNT)
  const slideCountRef = useRef(slideCount)
  slideCountRef.current = slideCount
  const [look, setLook] = useState(DEFAULT_LOOK)
  const lookRef = useRef(look)
  lookRef.current = look
  const [busy, setBusy] = useState<null | 'describing' | 'drafting'>(null)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardBusy, setWizardBusy] = useState<string | null>(null)
  const [presentOpen, setPresentOpen] = useState(false)
  const [presentFrom, setPresentFrom] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [htmlOpen, setHtmlOpen] = useState(false)
  const [progress, setProgress] = useState<ExportProgressState>(IDLE_PROGRESS)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const documentRef = useRef(document)
  // The content hash beside the content: what every edit names as its base.
  const hashRef = useRef(hashDeck(document.html))
  useEffect(() => {
    documentRef.current = document
    hashRef.current = hashDeck(document.html)
  }, [document])
  const boundPathRef = useRef<string | null>(null)
  const boundDocumentRef = useRef(document)
  const briefRef = useRef(brief)
  briefRef.current = brief
  const materialRef = useRef<MaterialItem[]>([])
  materialRef.current = material
  const slideSelectionRef = useRef<number[]>([])
  slideSelectionRef.current = slideSelection
  const elementSelectionRef = useRef<PickedElement[]>([])
  elementSelectionRef.current = elementSelection
  const selectedSlideRef = useRef(0)
  selectedSlideRef.current = selectedSlide
  const exportingRef = useRef(false)
  const cancelExportRef = useRef(false)
  const lastExportPathRef = useRef<string | null>(null)
  useEffect(() => {
    lastExportPathRef.current = lastExportPath
  }, [lastExportPath])

  const slides = useMemo(() => slidesFromHtml(document.html), [document.html])
  const slidesRef = useRef(slides)
  slidesRef.current = slides
  const geometry = useMemo(
    () => geometryFromHtml(document.html),
    [document.html],
  )
  const geometryRef = useRef(geometry)
  geometryRef.current = geometry
  const deckHash = useMemo(() => hashDeck(document.html), [document.html])

  // ---- revision history ----------------------------------------------------
  // The kit's store owns the index, the in-flight copies and the queued
  // writes; the app supplies the package (created on first need) and a
  // quiet window so its own history writes never read as external changes.
  const [revisions, setRevisions] =
    useState<RevisionIndex>(EMPTY_REVISION_INDEX)
  const [history] = useState(() =>
    createRevisionHistory<string>({
      fs: historyFs,
      packagePath: async () =>
        boundPathRef.current ??
        (await lifecycleRef.current.ensureDraft().catch(() => null)),
    }),
  )
  useEffect(() => history.subscribe(setRevisions), [history])
  const [undoOffer, setUndoOffer] = useState<RevisionEntry | null>(null)
  const [askRetry, setAskRetry] = useState<string | null>(null)

  // ---- verification --------------------------------------------------------
  // Every frame that renders a slide reports what it measured; the deck's
  // state is derived from the latest report per slide against the html as
  // it is now. Kept in a ref as well, because the export guard reads it
  // synchronously after a re-check.
  const evidenceRef = useRef<Record<number, SlideEvidence>>({})
  const [evidence, setEvidence] = useState<SlideEvidenceMap>({})
  const evidenceSyncRef = useRef<number | null>(null)
  const verification = useMemo(
    () => verifyDeck(slides.length, evidence, deckHash, geometry),
    [slides.length, evidence, deckHash, geometry],
  )
  const verificationRef = useRef(verification)
  verificationRef.current = verification
  // Dev-only: the verification evidence, readable from the console.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __ps4Verification?: unknown }).__ps4Verification =
      {
        hash: deckHash,
        verification,
        evidence,
      }
  }

  const openDeckPathRef = useRef<
    | ((path: string, options?: { view?: 'reset' | 'keep' }) => Promise<void>)
    | null
  >(null)

  const lifecycle = useDocumentLifecycle({
    appSlug: DECK_APP_SLUG,
    suffix: DECK_PACKAGE_SUFFIX,
    kind: 'package',
    suggestedTitle: document.title,
    debounceMs: AUTOSAVE_DELAY_MS,
    onExternalChange: ({ path, dirty }: { path: string; dirty: boolean }) => {
      if (dirty) return
      if (exportingRef.current) return
      void openDeckPathRef.current?.(path, { view: 'keep' })
    },
    serialize: () => {
      const current = boundDocumentRef.current
      return [
        {
          name: DECK_MANIFEST_FILE,
          content: serializePackageManifest({
            title: current.title,
            contentFile: DECK_FILE,
            ...(briefRef.current.trim() ? { brief: briefRef.current } : {}),
            // The wizard's answers travel with the deck, like the brief does;
            // a default is left out so an untouched manifest stays clean.
            ...(lookRef.current && lookRef.current !== DEFAULT_LOOK
              ? { look: lookRef.current }
              : {}),
            ...(Number.isFinite(slideCountRef.current) &&
            slideCountRef.current > 0 &&
            slideCountRef.current !== DEFAULT_SLIDE_COUNT
              ? { slideCount: slideCountRef.current }
              : {}),
            ...(materialRef.current.length
              ? { assets: notesFrom(materialRef.current) }
              : {}),
          }),
        },
        { name: DECK_FILE, content: current.html },
        { name: `${DECK_ASSETS_DIR}/.keep`, content: '' },
      ]
    },
  })
  const lifecycleRef = useRef(lifecycle)
  lifecycleRef.current = lifecycle

  /** Set the document and every ref that reads it, without an edit having happened (open, new). */
  const setDocumentNow = useCallback((next: DeckDocument) => {
    setDocument(next)
    documentRef.current = next
    boundDocumentRef.current = next
    hashRef.current = hashDeck(next.html)
  }, [])

  const applyDocument = useCallback(
    (next: DeckDocument) => {
      setDocumentNow(next)
      lifecycleRef.current.markDirty()
    },
    [setDocumentNow],
  )

  /**
   * The one door. Every change to the deck — a slide op, an inline edit,
   * the Source dialog, an ask, an agent tool, a draft, a restore — lands
   * here and nowhere else. A stale base is refused (re-run for a hand edit
   * that is a transform of html; refused outright for an agent, an ask or
   * a whole-text replacement); a revision origin snapshots the deck it
   * replaces into history/ first; the text-loss warning is raised when a
   * rewrite dropped much of the text unasked.
   */
  const editDeck = useCallback(
    (request: DeckEditRequest & { title?: string }): DeckEditResult => {
      const current = documentRef.current
      if (
        request.origin === 'agent' &&
        drawerRequestRef.current?.status === 'prepared' &&
        drawerRequestRef.current.path === boundPathRef.current
      )
        return {
          ok: false,
          reason: 'stale',
          currentHash: hashRef.current,
          message:
            'A saved drawer request owns this edit. Use commitDrawerRequest with its requestId.',
        }
      const plan = planDeckEdit(request, {
        html: current.html,
        hash: hashRef.current,
      })
      if (!plan.ok) {
        const message = refusalWords(request.origin, plan.message)
        setStatus(message)
        return {
          ok: false,
          reason: plan.reason,
          currentHash: plan.currentHash,
          message,
        }
      }
      const title = request.title?.trim() || current.title
      if (!plan.changed && title === current.title) {
        if (request.label) setStatus(request.label)
        return {
          ok: true,
          hash: plan.hash,
          changed: false,
          rebased: false,
          warning: null,
          snapshot: null,
        }
      }
      let snapshot: RevisionEntry | null = null
      let warning: string | null = null
      const policy = snapshotPolicy(request.origin, history.armed, plan.changed)
      history.armed = policy.armed
      if (policy.snapshot === 'before-revision') {
        snapshot = history.record(
          current.html,
          reasonFor(request.origin, request.reason),
          request.scope,
        )
        if (request.origin !== 'restore') {
          warning = preservationWarning(
            visibleTextChars(current.html),
            visibleTextChars(plan.html),
            request.request ?? '',
          )
        }
      } else if (policy.snapshot === 'first-manual-after-revision') {
        history.record(current.html, 'manual-edit')
      }
      applyDocument({ title, html: plan.html })
      if (isRevisionOrigin(request.origin)) {
        setUndoOffer(snapshot)
        setAskRetry(null)
      } else if (plan.changed) {
        setUndoOffer(null)
      }
      const words = [
        request.label ?? '',
        plan.rebased
          ? 'The deck had changed underneath — your edit was re-applied to it.'
          : '',
        warning ?? '',
      ]
        .filter(Boolean)
        .join(' ')
      if (words) setStatus(words)
      return {
        ok: true,
        hash: plan.hash,
        changed: plan.changed,
        rebased: plan.rebased,
        warning,
        snapshot,
      }
    },
    [applyDocument, history],
  )

  /** A hand edit as a transform of html — the common case for every control on the board. */
  const editHtml = useCallback(
    (
      transform: (html: string) => string,
      note?: string,
      options: Partial<Omit<DeckEditRequest, 'transform' | 'label'>> = {},
    ): DeckEditResult =>
      editDeck({
        transform,
        origin: 'manual',
        ...(note ? { label: note } : {}),
        ...options,
      }),
    [editDeck],
  )

  useVideoDrop('slide', (video, position) => {
    editHtml(html => insertVideoEmbed(html, selectedSlideRef.current, videoEmbedMarkup(video), position), 'Video embedded.')
  }, setStatus)

  useImageDrop('slide', (image, position) => {
    editHtml(html => insertVideoEmbed(html, selectedSlideRef.current, imageTransferMarkup(image), position), 'Image inserted.')
  }, setStatus, '[data-video-drop-surface]')

  /** Put a revision back: the current deck is snapshotted first, so this is itself undoable. */
  const restoreRevision = useCallback(
    async (file: string): Promise<DeckEditResult | { error: string }> => {
      setRestoring(true)
      try {
        const found = await history.restore(file)
        if ('error' in found) {
          setStatus(found.error)
          return found
        }
        const result = editDeck({
          transform: () => found.content,
          origin: 'restore',
          rebase: false,
          label: `Restored the deck from before ${reasonLabel(
            found.target.reason,
          )}.`,
        })
        void recordOperation({
          lane: 'user',
          kind: 'deck.restore',
          appSlug: DECK_APP_SLUG,
          summary: `Restored ${
            documentRef.current.title
          } from before ${reasonLabel(found.target.reason)}.`,
          ...(boundPathRef.current
            ? { refs: { path: boundPathRef.current } }
            : {}),
        })
        return result
      } finally {
        setRestoring(false)
      }
    },
    [editDeck, history],
  )

  /** What every frame reports after rendering a slide — pinned to the html it rendered. */
  const noteLayout = useCallback(
    (slide: number, report: LayoutReport, frameHtml: string) => {
      const isCurrent = frameHtml === documentRef.current.html
      // The stage plays a slide's build step by step; a report at an earlier
      // step sees fewer elements than the strip's full-step render and must
      // not overwrite it. Only a full-step render is evidence.
      if (isCurrent && report.step < (slidesRef.current[slide]?.steps ?? 0))
        return
      const hash = isCurrent ? hashRef.current : hashDeck(frameHtml)
      const box = isCurrent ? geometryRef.current : geometryFromHtml(frameHtml)
      evidenceRef.current = {
        ...evidenceRef.current,
        [slide]: evidenceFrom(report, hash, box),
      }
      if (evidenceSyncRef.current === null) {
        evidenceSyncRef.current = window.setTimeout(() => {
          evidenceSyncRef.current = null
          setEvidence(evidenceRef.current)
        }, 60)
      }
    },
    [],
  )

  /**
   * Measure every slide now, in the kit's on-screen-but-invisible frame:
   * the export guard's re-check, the badge's click, and what a tab coming
   * back to view does. The deck state is updated in the ref at once, so a
   * guard reading it after the await sees the re-check.
   */
  const recheckLayout = useCallback(async (): Promise<void> => {
    const html = documentRef.current.html
    const measured = await measureDeck(
      html,
      slidesFromHtml(html),
      geometryFromHtml(html),
      inlineAssetUrls(html, picturesOnly(previewsRef.current)),
    )
    if (documentRef.current.html !== html) return
    if (!measured) {
      setStatus(
        'Could not measure the deck — keep the app visible and try again.',
      )
      return
    }
    evidenceRef.current = { ...evidenceRef.current, ...measured }
    verificationRef.current = verifyDeck(
      slidesRef.current.length,
      evidenceRef.current,
      hashRef.current,
      geometryRef.current,
    )
    setEvidence(evidenceRef.current)
  }, [])

  // A tab coming back to view is a reason to measure again: whatever the
  // frames measured while hidden was never trusted.
  useEffect(() => {
    const onVisible = (): void => {
      if (window.document.visibilityState !== 'visible') return
      if (
        verificationRef.current.state === 'checking' &&
        slidesRef.current.length
      )
        void recheckLayout()
    }
    window.document.addEventListener('visibilitychange', onVisible)
    return () =>
      window.document.removeEventListener('visibilitychange', onVisible)
  }, [recheckLayout])

  // The safety net under the frames: a deck still `checking` a moment after
  // its last change — a frame that reloaded while hidden, a slide the strip
  // never showed — is measured in the app's own frame, once per version.
  const autoCheckedHashRef = useRef('')
  useEffect(() => {
    if (verification.state !== 'checking' || !slides.length) return
    if (autoCheckedHashRef.current === deckHash) return
    const handle = window.setTimeout(() => {
      if (window.document.visibilityState !== 'visible' || exportingRef.current)
        return
      autoCheckedHashRef.current = deckHash
      void recheckLayout()
    }, 2500)
    return () => window.clearTimeout(handle)
  }, [verification.state, deckHash, slides.length, recheckLayout])

  const clearEvidence = useCallback(() => {
    evidenceRef.current = {}
    setEvidence({})
    setUndoOffer(null)
    setAskRetry(null)
  }, [])

  const readAssetFiles = useCallback(
    async (path: string): Promise<{ name: string; bytes?: number }[]> => {
      const result = (await listFiles(`${path}/${DECK_ASSETS_DIR}`)) as {
        entries?: {
          name?: string
          byteLength?: number
          isDirectory?: boolean
        }[]
      }
      return (result?.entries ?? [])
        .filter(entry => entry?.name && !entry.isDirectory)
        .map(entry => ({
          name: entry.name as string,
          ...(typeof entry.byteLength === 'number'
            ? { bytes: entry.byteLength }
            : {}),
        }))
    },
    [],
  )

  /**
   * Read the images so the grid shows the picture, not the file name — and
   * the clips the deck references, so the frames can play them. Every
   * frame is a sandboxed srcDoc with no origin: it shows a package file
   * only by inlining it, and this map is what it inlines from.
   */
  const loadPreviews = useCallback(
    async (path: string, items: MaterialItem[]): Promise<void> => {
      const referenced = new Set(referencedAssetNames(documentRef.current.html))
      for (const item of items) {
        if (item.kind !== 'image' && !(item.kind === 'video' && referenced.has(item.name))) continue
        const cap = previewCapFor(item.name)
        if (item.bytes !== undefined && item.bytes > cap) continue
        try {
          const dataUrl = await readBinaryDataUrl(
            `${path}/${DECK_ASSETS_DIR}/${item.name}`,
            cap,
          )
          setPreviews(current =>
            current[item.name] === dataUrl
              ? current
              : { ...current, [item.name]: dataUrl },
          )
        } catch {
          // A file that will not read shows its name, as it did before.
        }
      }
    },
    [],
  )

  const loadMaterial = useCallback(
    async (path: string, notes: AssetNote[]): Promise<void> => {
      // A file just added may be the clip a frame asked for and did not get.
      unreadableClipsRef.current.clear()
      try {
        const merged = mergeMaterial(await readAssetFiles(path), notes)
        setMaterial(merged)
        void loadPreviews(path, merged)
      } catch {
        setMaterial([])
        setPreviews({})
      }
    },
    [readAssetFiles, loadPreviews],
  )

  const openDeckPath = useCallback(
    async (
      path: string,
      { view = 'reset' as 'reset' | 'keep' } = {},
    ): Promise<void> => {
      setError(null)
      setStatus('Opening…')
      try {
        const root = path.replace(/\/+$/, '')
        const html = await readTextFile(`${root}/${DECK_FILE}`)
        let title = deckTitleFromPath(root)
        let notes: AssetNote[] = []
        // Wizard answers restore from the manifest, and RESET to defaults for
        // a deck that never stored them — otherwise the previous deck's
        // brief, look and slide count leak into this one.
        let nextBrief = ''
        let nextLook = DEFAULT_LOOK
        let nextSlideCount = DEFAULT_SLIDE_COUNT
        try {
          const manifest = parsePackageManifest(
            await readTextFile(`${root}/${DECK_MANIFEST_FILE}`),
          )
          title = manifest.title
          notes = manifest.assets ?? []
          nextBrief = manifest.brief ?? ''
          nextLook = manifest.look ?? DEFAULT_LOOK
          nextSlideCount = manifest.slideCount ?? DEFAULT_SLIDE_COUNT
        } catch {
          // A deck opened directly has no manifest of ours; the folder name
          // is a perfectly good title.
        }
        setBrief(nextBrief)
        setLook(nextLook)
        setSlideCount(nextSlideCount)
        try {
          drawerRequestRef.current = JSON.parse(
            await readTextFile(`${root}/drawer-request.json`),
          )
        } catch {
          drawerRequestRef.current = null
        }
        const sameDeck = boundPathRef.current === root
        setDocumentNow({ title, html })
        setDocumentPath(root)
        setDocumentStarted(true)
        if (!sameDeck) clearEvidence()
        void history.load(root)
        if (view !== 'keep') {
          setBoardTab('slides')
          setWizardOpen(false)
          setSelectedSlide(0)
          setSlideSelection([])
          setElementSelection([])
        }
        void loadMaterial(root, notes)
        if (!exportingRef.current && !sameDeck) {
          setProgress(IDLE_PROGRESS)
          setLastExportPath(null)
        }
        // The finished file is the durable fact, not React state: whatever
        // exports/ holds is what "the last export" means for this deck.
        void (async () => {
          try {
            const listing = (await listFiles(`${root}/${DECK_EXPORT_DIR}`)) as {
              entries?: { name?: string; isDirectory?: boolean }[]
            }
            const entries = listing?.entries ?? []
            const file = entries.find(
              entry =>
                entry?.name &&
                !entry.isDirectory &&
                /\.(pdf|mp4)$/i.test(entry.name),
            )
            if (file) {
              setLastExportPath(`${root}/${DECK_EXPORT_DIR}/${file.name}`)
            } else if (
              // An image export's artifact is the frames folder itself.
              entries.some(
                entry => entry?.name === 'frames' && entry.isDirectory,
              )
            ) {
              setLastExportPath(`${root}/${DECK_EXPORT_DIR}/frames`)
            }
          } catch {
            // No exports folder yet: nothing to link.
          }
        })()
        setStatus(`Opened ${title}`)
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
        setStatus('Could not open the deck.')
      }
    },
    [loadMaterial, setDocumentNow, clearEvidence, history],
  )
  useEffect(() => {
    openDeckPathRef.current = openDeckPath
  }, [openDeckPath])

  useEffect(() => {
    const path = viewportResource?.path?.trim()
    if (!appReady || !path) return
    void openDeckPath(path).finally(clearResource)
  }, [appReady, viewportResource, clearResource, openDeckPath])

  useEffect(() => {
    if (boundPathRef.current === documentPath) return
    const target = documentPath
    const current = lifecycleRef.current
    void current.flush().finally(() => {
      boundPathRef.current = target
      boundDocumentRef.current = documentRef.current
      if (target) current.adopt(target, { title: documentRef.current.title })
      else current.reset()
    })
  }, [documentPath])

  useEffect(() => {
    const path = lifecycle.doc.path
    if (!path || boundPathRef.current === path) return
    boundPathRef.current = path
    setDocumentPath(path)
  }, [lifecycle.doc.path])

  // The title names the file, for drafts as well as filed decks: a draft
  // folder IS the deck on disk.
  useEffect(() => {
    const state = lifecycleRef.current.doc.status
    if (state !== 'filed' && state !== 'draft') return
    const title = document.title?.trim()
    if (!title || title === lifecycleRef.current.doc.title) return
    const handle = window.setTimeout(() => {
      void lifecycleRef.current.rename(title)
    }, 2000)
    return () => window.clearTimeout(handle)
  }, [document.title])

  // ---- slide operations: every one is a document edit -------------------

  const moveSlideAt = useCallback(
    (from: number, to: number) => {
      editHtml(html => moveSlide(html, from, to), 'Slide moved.')
      setSelectedSlide(to)
    },
    [editHtml],
  )

  const duplicateSlideAt = useCallback(
    (index: number) => {
      editHtml(html => duplicateSlide(html, index), 'Slide duplicated.')
      setSelectedSlide(index + 1)
    },
    [editHtml],
  )

  const deleteSlideAt = useCallback(
    (index: number) => {
      const before = slidesFromHtml(documentRef.current.html).length
      editHtml(html => deleteSlide(html, index), 'Slide deleted.')
      if (before <= 1) {
        setStatus('A deck keeps at least one slide.')
        return
      }
      setSelectedSlide(current =>
        Math.max(0, current - (index <= current ? 1 : 0)),
      )
    },
    [editHtml],
  )

  const addSlideAtEnd = useCallback(
    (blockId?: string) => {
      const before = slidesFromHtml(documentRef.current.html).length
      const block = blockId ? findBlock(blockId) : undefined
      editHtml(
        html =>
          addSlide(
            html,
            block ? block.html : createStarterSlideHtml('New slide'),
          ),
        block ? `Added a ${block.label.toLowerCase()} slide.` : 'Slide added.',
      )
      setSelectedSlide(before)
      setBoardTab('slides')
    },
    [editHtml],
  )

  /** Retype a picked element's words, without going through the model. */
  const editElementText = useCallback(
    (path: string, text: string, index = selectedSlideRef.current) =>
      editHtml(html => setElementText(html, index, path, text)),
    [editHtml],
  )

  /**
   * Put a picture in a picked element — an image or a placeholder box.
   *
   * The file is copied into the package first, so the deck stays portable:
   * a slide pointing at somewhere on this machine is a slide that breaks
   * the moment the folder moves.
   */
  const replaceElementImage = useCallback(
    (path: string, index = selectedSlideRef.current) => {
      void (async () => {
        const deckPath = boundPathRef.current
        if (!deckPath) {
          setStatus('Save the deck first, so there is a package to add to.')
          return
        }
        try {
          const result = (await bridge.call(
            PLATFORM_BRIDGE_METHODS.DIALOG_OPEN_FILE,
            [
              {
                title: 'Put an image on this slide',
                filters: [
                  {
                    name: 'Images',
                    extensions: [
                      'png',
                      'jpg',
                      'jpeg',
                      'gif',
                      'webp',
                      'avif',
                      'svg',
                    ],
                  },
                  { name: 'All files', extensions: ['*'] },
                ],
              },
            ],
          )) as { path?: string | null } | null
          const picked = result?.path
          if (!picked) return
          const reference = await addPackageAsset(picked)
          await loadMaterial(deckPath, notesFrom(materialRef.current))
          editHtml(
            html => setElementSrc(html, index, path, reference),
            'Image placed.',
          )
        } catch (imageError) {
          setStatus(
            imageError instanceof Error
              ? imageError.message
              : String(imageError),
          )
        }
      })()
    },
    [editHtml, loadMaterial],
  )

  const editSlide = useCallback(
    (index: number, patch: SlideEdit) =>
      editHtml(html => setSlideContent(html, index, patch)),
    [editHtml],
  )

  /**
   * Remove picked elements. Deepest first: paths are positional, so removing
   * "0" first would shift "1" to where "0" was.
   */
  const deleteElements = useCallback(
    (paths: string[], index = selectedSlideRef.current) => {
      const ordered = [...new Set(paths)].sort((a, b) =>
        b.localeCompare(a, 'en', { numeric: true }),
      )
      editHtml(
        html => {
          let next = html
          for (const path of ordered)
            next = deleteSlideElement(next, index, path)
          return next
        },
        ordered.length === 1
          ? 'Element deleted.'
          : `${ordered.length} elements deleted.`,
      )
      setElementSelection([])
    },
    [editHtml],
  )

  const setStepFor = useCallback(
    (path: string, step: number, index = selectedSlideRef.current) => {
      editHtml(
        html => setElementStep(html, index, path, step),
        step > 0 ? `Arrives on press ${step}.` : 'On from the start.',
      )
    },
    [editHtml],
  )

  /**
   * Ask for a change, at whatever size the change is. The scope is not a
   * setting to find: picked elements beat ticked slides, which beat the slide
   * on screen — and only what is in scope is sent.
   */
  const askAboutSelection = useCallback(
    (request: string) => {
      const html = documentRef.current.html
      const baseHash = hashRef.current
      const all = slidesFromHtml(html)
      if (!all.length) return
      const picked = elementSelectionRef.current
      const ticked = slideSelectionRef.current.filter(index => all[index])
      const indexes = picked.length
        ? [selectedSlideRef.current]
        : ticked.length
        ? ticked
        : [selectedSlideRef.current]
      const scope = picked.length
        ? `${picked.length} element${picked.length === 1 ? '' : 's'}`
        : indexes.length === 1
        ? `slide ${indexes[0] + 1}`
        : indexes.length === all.length
        ? 'the whole deck'
        : `slides ${indexes.map(index => index + 1).join(', ')}`

      setAsking(true)
      void prepareDrawerRequest(
        'edit',
        request,
        indexes,
        picked.map(item => item.path),
        true,
      )
        .catch(error => setStatus(String(error)))
        .finally(() => setAsking(false))
    },
    [editDeck],
  )

  // ---- assets ------------------------------------------------------------

  const describeAsset = useCallback((name: string, description: string) => {
    setMaterial(items =>
      items.map(item =>
        item.name === name ? { ...item, description, described: false } : item,
      ),
    )
    lifecycleRef.current.markDirty()
  }, [])

  const setAssetRole = useCallback((name: string, role: AssetRole) => {
    setMaterial(items =>
      items.map(item => (item.name === name ? { ...item, role } : item)),
    )
    lifecycleRef.current.markDirty()
  }, [])

  const describeAll = useCallback(async (): Promise<void> => {
    const path = boundPathRef.current
    if (!path) return
    const pending = materialRef.current.filter(
      item => item.kind === 'image' && !item.description.trim(),
    )
    if (!pending.length) return
    await prepareDrawerRequest(
      'describe',
      'Describe the attached image pixels in one factual sentence each. Do not infer from filenames. If you cannot view images, report the limitation; do not commit invented descriptions.',
      [],
      [],
      true,
    )
  }, [])

  /**
   * Every attached image goes to the drafter, not just the references.
   *
   * Only reference-role files used to be read, which quietly broke the two
   * things people expect most: Auto could not read a look off a screenshot
   * left on its default role, and a logo could not appear on the title slide
   * because the model had never seen it. The role rides along so the drafter
   * knows which images are a look, which are content, and which are the mark.
   */
  const readReferences = useCallback(async (): Promise<ReferenceImage[]> => {
    const path = boundPathRef.current
    if (!path) return []
    const wanted = materialRef.current.filter(item => item.kind === 'image')
    const references: ReferenceImage[] = []
    for (const item of wanted) {
      try {
        const dataUrl = await readBinaryDataUrl(
          `${path}/${DECK_ASSETS_DIR}/${item.name}`,
          8 * 1024 * 1024,
        )
        const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
        if (match) {
          references.push({
            name: item.name,
            mimeType: match[1],
            data: match[2],
            role: item.role ?? 'content',
          })
        }
      } catch (error) {
        throw Error(`Cannot read image ${item.name}: ${String(error)}`)
      }
    }
    return references
  }, [])

  /** The wizard's package, created the first time something needs it. */
  const ensureWizardDraft = useCallback(async (): Promise<string | null> => {
    if (boundPathRef.current) return boundPathRef.current
    try {
      const path = await lifecycleRef.current.ensureDraft()
      if (path) {
        boundPathRef.current = path
        setDocumentPath(path)
      }
      return path
    } catch {
      // Standalone dev has no drafts; the in-memory deck carries on.
      return null
    }
  }, [])

  const draftFromBrief = useCallback(async (): Promise<{
    slides: number
    title: string
  }> => {
    try {
      await prepareDrawerRequest('draft', briefRef.current, [], [], true)
      setBoardTab('slides')
      return { slides: 0, title: documentRef.current.title }
    } catch (error) {
      setStatus(String(error))
      return { slides: 0, title: documentRef.current.title }
    }
  }, [])

  async function prepareDrawerRequest(
    kind: DrawerRequest['kind'],
    prompt: string,
    indexes: number[] = [],
    elementPaths: string[] = [],
    send = false,
  ) {
    if (drawerCommitBusy.current)
      throw Error('A drawer request is already being prepared or saved.')
    drawerCommitBusy.current = true
    let ownsLock = true
    try {
      const path = await ensureWizardDraft()
      if (!path)
        throw Error('Save this deck in PureDesktop before asking the drawer.')
      await lifecycleRef.current.flush({ throwOnError: true })
      const references = await readReferences()
      if (boundPathRef.current !== path)
        throw Error('Document changed before dispatch.')
      const request: DrawerRequest = {
        id: crypto.randomUUID(),
        path,
        baseHash: hashRef.current,
        html: documentRef.current.html,
        prompt,
        kind,
        indexes,
        elementPaths,
        images: await Promise.all(
          references.map(async r => ({
            name: r.name,
            sha256: await digest(r.data),
          })),
        ),
        status: 'prepared',
        ...(kind === 'describe'
          ? { descriptionBase: descriptionState(materialRef.current) }
          : {}),
      }
      let previous: DrawerRequest | null = null
      try {
        previous = JSON.parse(await readTextFile(`${path}/drawer-request.json`))
      } catch {}
      await writeTextFile(
        `${path}/drawer-request.json`,
        JSON.stringify(request),
      )
      drawerRequestRef.current = request
      if (send) {
        let sessionId = requestSession(previous, path, hashRef.current)
        if (sessionId && !(await sessions.get(sessionId))) sessionId = null
        if (!sessionId) {
          sessionId = (await sessions.create({ appId: DECK_APP_SLUG })).id
        }
        await updateCurrentWorkspaceTab({ sessionId })
        request.sessionId = sessionId
        await writeTextFile(
          `${path}/drawer-request.json`,
          JSON.stringify(request),
        )
        await toggleAgentDrawer({ open: true })
        drawerCommitBusy.current = false
        ownsLock = false
        await messages.send(sessionId, {
          content: `Read getDrawerRequest for requestId ${request.id} in ${path}. Complete that saved ${kind} request through commitDrawerRequest, then checkDeck and export only if requested. No other composition agent is needed.`,
          attachments: references.map(r => ({
            type: 'image' as const,
            mimeType: r.mimeType,
            name: r.name,
            source: {
              type: 'data' as const,
              encoding: 'base64' as const,
              data: r.data,
            },
          })),
        })
        setStatus('Request saved · continue in the drawer')
      }
      return {
        ...request,
        guide: deckDesignGuide(lookRef.current),
        slideCount: slideCountRef.current,
        material: materialRef.current,
      }
    } finally {
      if (ownsLock) drawerCommitBusy.current = false
    }
  }
  async function getDrawerRequest() {
    const path = boundPathRef.current
    if (!path) throw Error('No saved deck is open.')
    const request = JSON.parse(
      await readTextFile(`${path}/drawer-request.json`),
    ) as DrawerRequest
    if (request.path !== path) {
      if (request.outputHash !== hashRef.current)
        throw Error('Request belongs to another document.')
      request.path = path
    }
    drawerRequestRef.current = request
    return {
      ...request,
      guide: deckDesignGuide(lookRef.current),
      slideCount: slideCountRef.current,
      material: materialRef.current,
    }
  }
  async function cancelDrawerRequest(args: Record<string, unknown>) {
    if (drawerCommitBusy.current)
      throw Error(
        'A save is in progress; wait for its result before cancelling.',
      )
    drawerCommitBusy.current = true
    try {
      const request = await getDrawerRequest()
      if (request.id !== args.requestId)
        throw Error('Request identity mismatch.')
      if (request.status === 'committed')
        return { persisted: true, alreadyCommitted: true }
      request.status = 'cancelled'
      await writeTextFile(
        `${request.path}/drawer-request.json`,
        JSON.stringify(request),
      )
      drawerRequestRef.current = request
      return { cancelled: true, requestId: request.id }
    } finally {
      drawerCommitBusy.current = false
    }
  }
  async function commitDrawerRequest(args: Record<string, unknown>) {
    if (drawerCommitBusy.current)
      throw Error('A commit is already being saved.')
    drawerCommitBusy.current = true
    try {
      const request = await getDrawerRequest()
      if (args.requestId !== request.id || args.baseHash !== request.baseHash)
        throw Error('Request identity or baseHash mismatch.')
      if (request.status === 'cancelled')
        throw Error('This request was cancelled. Prepare a new request.')
      if (request.status === 'committed')
        return {
          requestId: request.id,
          persisted: true,
          hash: request.outputHash,
          duplicate: true,
        }
      const recovered =
        request.kind !== 'describe' && request.outputHash === hashRef.current
      if (
        request.path !== boundPathRef.current ||
        (!recovered && request.baseHash !== hashRef.current)
      )
        throw Error(
          'Document changed. Prepare a new request after reconciling changes.',
        )
      for (const image of request.images) {
        const data = await readBinaryDataUrl(
          `${request.path}/assets/${image.name}`,
          8 * 1024 * 1024,
        )
        if ((await digest(data.split(',')[1])) !== image.sha256)
          throw Error('Image bytes changed. Prepare a new request.')
      }
      if (
        request.path !== boundPathRef.current ||
        (!recovered && request.baseHash !== hashRef.current)
      )
        throw Error('Document changed during validation.')
      const diskHash = hashDeck(
        await readTextFile(`${request.path}/${DECK_FILE}`),
      )
      if (diskHash !== (recovered ? request.outputHash : request.baseHash))
        throw Error(
          'Saved document changed outside this tab. Reopen and reconcile it.',
        )
      if (
        request.path !== boundPathRef.current ||
        (!recovered && request.baseHash !== hashRef.current)
      )
        throw Error('Document switched during disk validation.')
      if (request.kind === 'describe') {
        if (!Array.isArray(args.descriptions) || !args.descriptions.length)
          throw Error('descriptions must be a nonempty array.')
        for (const entry of args.descriptions) {
          if (
            !entry ||
            typeof entry.name !== 'string' ||
            !request.images.some(i => i.name === entry.name) ||
            typeof entry.description !== 'string' ||
            !entry.description.trim()
          )
            throw Error('Invalid image description.')
        }
        const byName = new Map(
          args.descriptions.map(e => [e.name, e.description.trim()]),
        )
        const updated = materialRef.current.map(item =>
          byName.has(item.name)
            ? { ...item, description: byName.get(item.name)!, described: true }
            : item,
        )
        assertDescriptionScope(request, materialRef.current, updated)
        materialRef.current = updated
        setMaterial(updated)
        lifecycleRef.current.markDirty()
      } else if (!recovered) {
        if (typeof args.html !== 'string' || !args.html.trim())
          throw Error('html must be the complete valid deck document.')
        assertScope(request, args.html)
        request.outputHash = hashDeck(args.html)
        await writeTextFile(
          `${request.path}/drawer-request.json`,
          JSON.stringify(request),
        )
        if (
          request.path !== boundPathRef.current ||
          request.baseHash !== hashRef.current
        )
          throw Error('Document changed before commit.')
        const result = editDeck({
          transform: () => args.html as string,
          origin: 'ask',
          baseHash: request.baseHash,
          rebase: false,
          reason: 'drawer-request',
          scope: request.kind,
          request: request.prompt,
          ...(request.kind === 'draft' && typeof args.title === 'string'
            ? { title: args.title }
            : {}),
          label: 'Drawer changes applied.',
        })
        if (!result.ok) throw Error(result.message)
      }
      await lifecycleRef.current.flush({ throwOnError: true })
      if (boundPathRef.current !== request.path) {
        const moved = boundPathRef.current
        if (!moved || request.outputHash !== hashRef.current)
          throw Error('Document switched before save confirmation.')
        const receipt = JSON.parse(
          await readTextFile(`${moved}/drawer-request.json`),
        )
        if (receipt.id !== request.id)
          throw Error('The renamed package does not own this request.')
        request.path = moved
      }
      const saved = await readTextFile(`${request.path}/${DECK_FILE}`)
      if (hashDeck(saved) !== hashRef.current)
        throw Error('Saved content does not match the applied revision.')
      request.status = 'committed'
      request.outputHash = hashRef.current
      await writeTextFile(
        `${request.path}/drawer-request.json`,
        JSON.stringify(request),
      )
      drawerRequestRef.current = request
      return {
        requestId: request.id,
        persisted: true,
        hash: request.outputHash,
        complete: false,
        nextAction:
          'checkDeck; repair real diagnostics before exporting. Persisted is not layout verified.',
      }
    } finally {
      drawerCommitBusy.current = false
    }
  }

  /**
   * Write bytes into the package's assets folder — the one path every add
   * goes through, whether the file came from the dialog, the drawer agent,
   * or a drop.
   */
  const writePackageAsset = useCallback(
    async (name: string, base64: string): Promise<string> => {
      const path = boundPathRef.current
      if (!path) throw new Error('there is no deck open')
      const fileName = name.trim()
      if (!fileName) throw new Error('the asset needs a file name')
      try {
        await createFolder(path, DECK_ASSETS_DIR)
      } catch {
        /* already there */
      }
      await writeBinaryFile(`${path}/${DECK_ASSETS_DIR}/${fileName}`, base64)
      void recordOperation({
        lane: 'agent',
        kind: 'deck.asset.add',
        appSlug: DECK_APP_SLUG,
        summary: `Added ${fileName} to ${documentRef.current.title}.`,
        refs: { path: `${path}/${DECK_ASSETS_DIR}/${fileName}` },
      })
      return `${DECK_ASSETS_DIR}/${fileName}`
    },
    [],
  )

  const addPackageAsset = useCallback(
    async (sourcePath: string, name?: string): Promise<string> => {
      if (!boundPathRef.current) throw new Error('there is no deck open')
      const binary = await readBinaryBase64(sourcePath)
      return writePackageAsset(
        name || fileNameFromPath(sourcePath),
        binary.base64,
      )
    },
    [writePackageAsset],
  )

  /** Files dropped on the assets pane, read in place and written the same way. */
  const addDroppedFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (!files.length) return
      const path = await ensureWizardDraft()
      if (!path) {
        setStatus('Files need a package, and none could be created here.')
        return
      }
      try {
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          await writePackageAsset(file.name, base64FromBytes(bytes))
        }
        await loadMaterial(path, notesFrom(materialRef.current))
        setStatus(
          files.length === 1
            ? `Added ${files[0].name}.`
            : `Added ${files.length} files.`,
        )
      } catch (dropError) {
        setStatus(
          dropError instanceof Error ? dropError.message : String(dropError),
        )
      }
    },
    [ensureWizardDraft, loadMaterial, writePackageAsset],
  )

  const addFilesFromDialog = useCallback(async (): Promise<void> => {
    const path = await ensureWizardDraft()
    if (!path) {
      setStatus('Files need a package, and none could be created here.')
      return
    }
    try {
      // The default dialog offers text and documents, which is why no
      // screenshot ever appears in it. Deck material is images and fonts.
      const result = (await bridge.call(
        PLATFORM_BRIDGE_METHODS.DIALOG_OPEN_FILE,
        [
          {
            title: 'Add to this deck',
            filters: [
              {
                name: 'Images and fonts',
                extensions: [
                  'png',
                  'jpg',
                  'jpeg',
                  'gif',
                  'webp',
                  'avif',
                  'svg',
                  'woff',
                  'woff2',
                  'ttf',
                  'otf',
                ],
              },
              { name: 'All files', extensions: ['*'] },
            ],
          },
        ],
      )) as { path?: string | null } | null
      const picked = result?.path
      if (!picked) return
      const reference = await addPackageAsset(picked)
      await loadMaterial(path, notesFrom(materialRef.current))
      setStatus(`Added ${reference.replace(/^assets\//, '')}.`)
    } catch (addError) {
      setStatus(addError instanceof Error ? addError.message : String(addError))
    }
  }, [addPackageAsset, ensureWizardDraft, loadMaterial])

  // ---- new deck ----------------------------------------------------------

  /**
   * What Cancel goes back to.
   *
   * Starting a new deck replaces whatever was open, so by the time the wizard
   * is on screen the previous deck is already gone from view. Remembering its
   * path is what lets Cancel mean cancel rather than a second Start empty.
   */
  const previousDeckPathRef = useRef<string | null>(null)

  const createNewDeck = useCallback(async (): Promise<void> => {
    setSwitcherOpen(false)
    previousDeckPathRef.current = boundPathRef.current
    const next = createDefaultDeckDocument()
    setDocumentNow(next)
    setDocumentPath(null)
    boundPathRef.current = null
    lifecycleRef.current.reset()
    history.reset()
    clearEvidence()
    setError(null)
    setDocumentStarted(true)
    setProgress(IDLE_PROGRESS)
    setLastExportPath(null)
    setMaterial([])
    setPreviews({})
    setBrief('')
    setLook(DEFAULT_LOOK)
    setSlideCount(DEFAULT_SLIDE_COUNT)
    setSelectedSlide(0)
    setBoardTab('slides')
    setWizardOpen(true)
    setStatus('New deck.')
    // No draft package yet, deliberately. `ensureDraft` names the package
    // from the suggestedTitle of the LAST render — the deck that was open a
    // moment ago — so creating it here mints a package named after the
    // previous deck. The draft is created on first need instead (adding a
    // file, or Create), by which point the reset title has rendered.
  }, [setDocumentNow, history, clearEvidence])

  const cancelNewDeck = useCallback((): void => {
    setWizardOpen(false)
    const previous = previousDeckPathRef.current
    previousDeckPathRef.current = null
    if (!previous) return
    void openDeckPathRef.current?.(previous, { view: 'reset' })
  }, [])

  // ---- export ------------------------------------------------------------

  const saveDeck = useCallback(async (): Promise<string> => {
    const lifecycle = lifecycleRef.current
    const path = (await lifecycle.ensureDraft()) ?? boundPathRef.current
    if (!path) throw new Error('the deck has no folder to save into')
    await lifecycle.flush({ throwOnError: true })
    boundPathRef.current = path
    setDocumentPath(path)
    return path
  }, [])

  const runExport = useCallback(
    async (kind: ExportKind, notesAppendix: boolean): Promise<string> => {
      if (exportingRef.current) throw new Error('an export is already running')
      exportingRef.current = true
      cancelExportRef.current = false
      setProgress({
        phase: 'preparing',
        unit: 0,
        unitCount: slidesFromHtml(documentRef.current.html).length,
        message: 'Preparing the deck…',
      })
      try {
        // The kit's guard, before anything is touched: an unverified layout
        // is measured again in a visible frame first, and refused out loud
        // when it still is not verified — so a refusal never mints a draft
        // package or writes a file. `exportDeck` holds the same gate inside
        // the pipeline, for every caller.
        const verify = {
          state: () => verificationRef.current.state,
          recheck: recheckLayout,
          failedMessage: () => exportFailedWords(verificationRef.current),
        }
        if (verificationRef.current.state !== 'verified') {
          setProgress({
            phase: 'preparing',
            unit: 0,
            unitCount: slidesFromHtml(documentRef.current.html).length,
            message: 'Checking the layout…',
          })
        }
        await assertDeckExportable(documentRef.current.html, verify)

        const path = await saveDeck()

        // PowerPoint lays each clip over its slide's picture where the
        // board shows it; the boxes come from the same render.
        const exportHtml = documentRef.current.html
        const exportSlides = slidesFromHtml(exportHtml)
        const videos =
          kind === 'pptx' && hasVideo(exportHtml)
            ? await measureVideoPlacements(
                exportHtml,
                exportSlides,
                geometryFromHtml(exportHtml),
                previewsRef.current,
              )
            : undefined

        const result = await exportDeck({
          html: exportHtml,
          slides: exportSlides,
          documentPath: path,
          title: documentRef.current.title,
          kind,
          notesAppendix,
          onProgress: setProgress,
          shouldCancel: () => cancelExportRef.current,
          verify,
          ...(videos?.length ? { videos } : {}),
        })
        setLastExportPath(result.outputPath)
        const mismatch =
          kind === 'pdf' &&
          typeof result.sheets === 'number' &&
          result.expectedSheets !== undefined &&
          result.sheets !== result.expectedSheets
        setStatus(
          mismatch
            ? `Exported, but the PDF has ${result.sheets} sheet${
                result.sheets === 1 ? '' : 's'
              } for ${
                result.expectedSheets
              } expected — the print run does not match the board. Tell the assistant.`
            : kind === 'pdf'
            ? `Exported ${result.units} pages.`
            : kind === 'images'
            ? `Exported ${result.units} images.`
            : /\.mp4$/i.test(result.outputPath)
            ? `Exported ${fileNameFromPath(result.outputPath)}.`
            : `Captured ${result.units} frames — this runtime cannot encode video.`,
        )
        void recordOperation({
          lane: 'user',
          kind: 'deck.export',
          appSlug: DECK_APP_SLUG,
          summary: `Exported ${documentRef.current.title} as ${kind}.`,
          refs: { path: result.outputPath },
        })
        return result.outputPath
      } catch (exportError) {
        const cancelled = exportError instanceof ExportCancelled
        const message = cancelled
          ? 'Export stopped.'
          : exportError instanceof Error
          ? exportError.message
          : String(exportError)
        // A refusal is shown in the dialog too, in the same words.
        setProgress({
          phase: cancelled ? 'idle' : 'error',
          unit: 0,
          unitCount: 0,
          message,
        })
        setStatus(message)
        throw exportError
      } finally {
        exportingRef.current = false
      }
    },
    [recheckLayout, saveDeck],
  )

  const stopExport = useCallback((): boolean => {
    cancelExportRef.current = true
    setStatus('Stopping the export…')
    void cancelShellRender().catch(() => {
      /* the flag still stops the next stage */
    })
    return true
  }, [])

  // ---- the drawer agent's half of every pair ----------------------------

  /** The door options for an agent tool: origin, the hash it read, the history scope. */
  const agentEdit = (
    options: { baseHash?: string } | undefined,
    scope: string,
  ): Partial<Omit<DeckEditRequest, 'transform' | 'label'>> => ({
    origin: 'agent',
    ...(options?.baseHash ? { baseHash: options.baseHash } : {}),
    reason: 'agent',
    scope,
  })

  /**
   * A clip the document names is read for the frames as soon as it is
   * named — a slide that gets its video after the material was listed
   * would otherwise show the package path, which a frame cannot load.
   */
  useEffect(() => {
    const path = boundPathRef.current
    if (!path) return
    const wanted = referencedAssetNames(document.html).filter(
      name =>
        kindOf(name) === 'video' &&
        !(name in previewsRef.current) &&
        !unreadableClipsRef.current.has(`${path}/${name}`),
    )
    if (!wanted.length) return
    let cancelled = false
    void (async () => {
      for (const name of wanted) {
        const cap = previewCapFor(name)
        try {
          const dataUrl = await readBinaryDataUrl(`${path}/${DECK_ASSETS_DIR}/${name}`, cap)
          if (cancelled) return
          setPreviews(current => (current[name] === dataUrl ? current : { ...current, [name]: dataUrl }))
        } catch {
          // Missing or too large: the frame shows the clip's box, the export
          // uses the file. Remembered, so every keystroke does not ask again;
          // adding the file to the package clears the memory.
          unreadableClipsRef.current.add(`${path}/${name}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [document.html])

  /** Add a composition as a slide, its slot filled: the tool and the pane's button are one door. */
  const placeBlock = useCallback(
    (blockId: string, atIndex?: number, options?: { baseHash?: string }, fill?: BlockFill) => {
      const block = findBlock(blockId)
      if (!block) return null
      return editHtml(
        html => addSlide(html, blockHtmlWith(block, fill), atIndex),
        fill?.asset ? `Added a ${block.label.toLowerCase()} slide with ${fill.asset}.` : `Added a ${block.label.toLowerCase()} slide.`,
        agentEdit(options, 'slide'),
      )
    },
    [editHtml, agentEdit],
  )

  usePureSlidesAgentTools(true, {
    document,
    hash: deckHash,
    verification,
    documentPath: lifecycle.doc.path ?? documentPath,
    slides,
    material,
    lastExportPath,
    exporting: exportingRef.current,
    ui: {
      view: boardTab,
      selectedSlide,
      slideSelection,
      elementSelection,
      brief,
      slideCount,
    },
    summarize: () => summarizeDeck(documentRef.current, slides.length),
    applyDeck: (html, patch, title, options) =>
      editDeck({
        transform: () => (patch ? withGeometry(html, patch) : html),
        origin: 'agent',
        ...(options?.baseHash ? { baseHash: options.baseHash } : {}),
        rebase: false,
        label: 'Deck replaced.',
        reason: 'agent-setDeck',
        scope: 'deck',
        ...(title?.trim() ? { title } : {}),
      }),
    createAndOpen: async next => {
      const lifecycleNow = lifecycleRef.current
      await lifecycleNow.flush()
      setDocumentNow(next)
      setDocumentPath(null)
      boundPathRef.current = null
      lifecycleNow.reset()
      history.reset()
      clearEvidence()
      const path = await lifecycleNow.ensureDraft()
      if (!path) return null
      boundPathRef.current = path
      setDocumentPath(path)
      void history.load(path)
      setDocumentStarted(true)
      setBoardTab('slides')
      setWizardOpen(false)
      return path
    },
    listAssets: async () => {
      const path = boundPathRef.current
      if (!path) return []
      return (await readAssetFiles(path)).filter(file => file.name !== '.keep')
    },
    addAsset: async (sourcePath, name) => {
      const reference = await addPackageAsset(sourcePath, name)
      const path = boundPathRef.current
      if (path) await loadMaterial(path, notesFrom(materialRef.current))
      return reference
    },
    describeAsset: (name, description) => {
      if (
        drawerRequestRef.current?.status === 'prepared' &&
        drawerRequestRef.current.path === boundPathRef.current
      )
        throw Error('Use commitDrawerRequest for the saved image request.')
      describeAsset(name, description)
    },
    setAssetRole,
    setBrief: patch => {
      if (patch.brief !== undefined) {
        setBrief(patch.brief)
        briefRef.current = patch.brief
        lifecycleRef.current.markDirty()
      }
      if (patch.slides !== undefined) {
        setSlideCount(patch.slides)
        slideCountRef.current = patch.slides
        lifecycleRef.current.markDirty()
      }
    },
    draftDeck: () => prepareDrawerRequest('draft', briefRef.current),
    getDrawerRequest,
    commitDrawerRequest,
    cancelDrawerRequest,
    // Every agent edit goes through the same door as the button beside it,
    // with origin `agent` and the hash the agent read (when it gave one).
    slideOps: {
      add: (html, atIndex, options) =>
        editHtml(
          current => addSlide(current, html, atIndex),
          'Slide added.',
          agentEdit(options, 'slide'),
        ),
      update: (index, patch, options) =>
        editHtml(
          current => setSlideContent(current, index, patch),
          'Slide updated.',
          agentEdit(options, `slide ${index + 1}`),
        ),
      setHtml: (index, html, options) =>
        editHtml(
          current => {
            const wrapped = html.trim().startsWith('<')
              ? html
              : `<div data-slide>${html}</div>`
            return setSlideElement(current, index, '', wrapped) === current
              ? addSlide(deleteSlide(current, index), wrapped, index)
              : setSlideElement(current, index, '', wrapped)
          },
          'Slide replaced.',
          agentEdit(options, `slide ${index + 1}`),
        ),
      move: (from, to, options) => {
        const result = editHtml(
          html => moveSlide(html, from, to),
          'Slide moved.',
          agentEdit(options, `slide ${from + 1}`),
        )
        if (result.ok && result.changed) setSelectedSlide(to)
        return result
      },
      duplicate: (index, options) => {
        const result = editHtml(
          html => duplicateSlide(html, index),
          'Slide duplicated.',
          agentEdit(options, `slide ${index + 1}`),
        )
        if (result.ok && result.changed) setSelectedSlide(index + 1)
        return result
      },
      remove: (index, options) => {
        const result = editHtml(
          html => deleteSlide(html, index),
          'Slide deleted.',
          agentEdit(options, `slide ${index + 1}`),
        )
        if (result.ok && result.changed) {
          setSelectedSlide(current =>
            Math.max(0, current - (index <= current ? 1 : 0)),
          )
        }
        return result
      },
    },
    setElement: (index, path, html, options) =>
      editHtml(
        current => setSlideElement(current, index, path, html),
        'Element replaced.',
        agentEdit(options, `slide ${index + 1} element ${path}`),
      ),
    setElementText: (index, path, text, options) =>
      editHtml(
        html => setElementText(html, index, path, text),
        'Element retyped.',
        agentEdit(options, `slide ${index + 1} element ${path}`),
      ),
    blocks: blockCatalogue(),
    addBlock: (blockId, atIndex, options, fill) => placeBlock(blockId, atIndex, options, fill),
    deleteElement: (index, path, options) =>
      editHtml(
        html => deleteSlideElement(html, index, path),
        'Element deleted.',
        agentEdit(options, `slide ${index + 1} element ${path}`),
      ),
    setElementStep: (index, path, step, options) =>
      editHtml(
        html => setElementStep(html, index, path, step),
        step > 0 ? `Arrives on press ${step}.` : 'On from the start.',
        agentEdit(options, `slide ${index + 1} element ${path}`),
      ),
    listRevisions: () => history.newestFirst(),
    restoreRevision,
    setSelection: patch => {
      if (patch.selectedSlide !== undefined)
        setSelectedSlide(patch.selectedSlide)
      if (patch.slideIndexes !== undefined)
        setSlideSelection(patch.slideIndexes)
      if (patch.elementPaths !== undefined) {
        setElementSelection(
          patch.elementPaths.map(path => ({
            path,
            label: labelForPath(
              documentRef.current.html,
              selectedSlideRef.current,
              path,
            ),
          })),
        )
      }
      if (patch.view !== undefined) setBoardTab(patch.view as BoardTab)
    },
    present: from => {
      setPresentFrom(from)
      setPresentOpen(true)
    },
    saveDeck,
    runExport,
    stopExport,
  })

  const hasOpenDeck =
    documentStarted || documentPath !== null || lifecycle.doc.path !== null

  // One verb beside the status line: Retry a refused ask, or Undo the
  // last revision (which restores the snapshot taken before it).
  const statusAction: StatusAction | null = askRetry
    ? { label: 'Retry', run: () => askAboutSelection(askRetry) }
    : undoOffer
    ? { label: 'Undo', run: () => void restoreRevision(undoOffer.file) }
    : null
  const revisionsNewestFirst = useMemo(
    () => history.newestFirst(),
    [history, revisions],
  )
  const currentTextChars = useMemo(
    () => visibleTextChars(document.html),
    [document.html],
  )

  const loadDeckPreview = useCallback(
    async ({ path }: { path: string; kind: 'package' | 'file' }) => {
      try {
        const root = path.replace(/\/+$/, '')
        const html = await readTextFile(`${root}/${DECK_FILE}`)
        let title: string | undefined
        try {
          title = parsePackageManifest(
            await readTextFile(`${root}/${DECK_MANIFEST_FILE}`),
          ).title
        } catch {
          // No manifest of ours: the file name is a fine name.
        }
        const { coverHtml } = await import('./lib/cover')
        return {
          kind: 'html' as const,
          html: coverHtml(html),
          ...(title ? { title } : {}),
        }
      } catch {
        return null
      }
    },
    [],
  )

  return (
    <AppFrame
      data-app={DECK_APP_SLUG}
      identityAppSlug={DECK_APP_SLUG}
      headerDocumentName={
        document.title?.trim() || (lifecycle.doc.path ? fileNameFromPath(lifecycle.doc.path) : undefined)
      }
      headerActions={
        <DocumentHeaderActions
          lifecycle={lifecycle}
          title={document.title || DEFAULT_DECK_TITLE}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />
      }
    >
      {hasOpenDeck ? (
        <>
          <NewDeckWizard
            open={wizardOpen}
            onSetRole={setAssetRole}
            brief={brief}
            onBrief={next => {
              setBrief(next)
              lifecycleRef.current.markDirty()
            }}
            slideCount={slideCount}
            onSlideCount={next => {
              setSlideCount(next)
              lifecycleRef.current.markDirty()
            }}
            geometry={geometry}
            onFormat={(width, height) =>
              editHtml(
                html => withGeometry(html, { width, height }),
                'Frame size changed.',
              )
            }
            look={look}
            onLook={next => {
              setLook(next)
              lifecycleRef.current.markDirty()
            }}
            material={material}
            previews={previews}
            onAddFiles={() => void addFilesFromDialog()}
            busy={wizardBusy !== null}
            busyLabel={wizardBusy ?? ''}
            onCreate={() => {
              void (async () => {
                try {
                  setWizardBusy('Drafting the slides…')
                  await draftFromBrief()
                } finally {
                  setWizardBusy(null)
                  setWizardOpen(false)
                }
              })()
            }}
            onSkip={() => setWizardOpen(false)}
            onCancel={cancelNewDeck}
          />
          <PresentWindow
            open={presentOpen}
            onClose={() => setPresentOpen(false)}
            html={document.html}
            slides={slides}
            geometry={geometry}
            previews={previews}
            from={presentFrom}
            onPositionChange={setSelectedSlide}
          />
          <ExportDialog
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            html={document.html}
            slides={slides}
            progress={progress}
            lastExportPath={lastExportPath}
            verification={verification}
            onExport={(kind, notesAppendix) =>
              void runExport(kind, notesAppendix).catch(() => {
                /* refused — the status line and the dialog already say why */
              })
            }
            onCancel={() => stopExport()}
            onReveal={path => void revealPath(path)}
          />
          <HtmlDialog
            open={htmlOpen}
            onClose={() => setHtmlOpen(false)}
            html={document.html}
            hash={deckHash}
            onCommit={(html, baseHash) => {
              // A whole-text replacement cannot be merged: if the deck moved
              // underneath the dialog, the commit is refused and the dialog
              // re-syncs to the current version.
              const result = editHtml(() => html, 'Source edited.', {
                baseHash,
                rebase: false,
              })
              return result.ok
                ? { ok: true }
                : { ok: false, message: result.message }
            }}
          />
          <HistoryDialog
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            entries={revisionsNewestFirst}
            currentTextChars={currentTextChars}
            busy={restoring}
            onRestore={file => {
              void restoreRevision(file)
            }}
          />
        </>
      ) : null}

      {hasOpenDeck ? (
        <SlideBoardView
          html={document.html}
          slides={slides}
          geometry={geometry}
          tab={boardTab}
          onTab={setBoardTab}
          assetsPane={
            <AssetsPane
              material={material}
              previews={previews}
              brief={brief}
              busy={busy}
              status={lifecycle.doc.error ?? error ?? status}
              onAddFiles={() => void addFilesFromDialog()}
              onDropFiles={files => void addDroppedFiles(files)}
              onDescribe={describeAsset}
              onSetRole={setAssetRole}
              onPlace={name => {
                const result = placeBlock('video-full', undefined, undefined, { asset: name })
                if (result && result.ok) {
                  setSelectedSlide(slidesFromHtml(documentRef.current.html).length - 1)
                  setBoardTab('slides')
                }
              }}
              onDescribeAll={() => void describeAll()}
              onBrief={next => {
                setBrief(next)
                lifecycleRef.current.markDirty()
              }}
              onDraft={() => void draftFromBrief()}
            />
          }
          selected={selectedSlide}
          onSelect={setSelectedSlide}
          onMove={moveSlideAt}
          onDuplicate={duplicateSlideAt}
          onDelete={deleteSlideAt}
          onAdd={addSlideAtEnd}
          onElementText={(path, text) => editElementText(path, text)}
          onEditElement={(index, path, outerHtml, frameHtml) => {
            // Emptying an element inline MEANS deleting it — a committed
            // empty block keeps its space and reads as "not deleted".
            const probe = new DOMParser().parseFromString(
              outerHtml,
              'text/html',
            ).body.firstElementChild
            const emptied =
              probe &&
              probe.tagName !== 'IMG' &&
              probe.children.length === 0 &&
              !(probe.textContent ?? '').trim()
            // The edit was typed into the frame's version of the deck. If
            // the deck moved since, the edit is a transform by path and is
            // re-applied to the latest — said so in the status line.
            const baseHash =
              frameHtml === documentRef.current.html
                ? hashRef.current
                : hashDeck(frameHtml)
            editHtml(
              html =>
                emptied
                  ? deleteSlideElement(html, index, path)
                  : setSlideElement(html, index, path, outerHtml),
              emptied ? 'Element deleted.' : 'Edited.',
              { baseHash },
            )
          }}
          onReplaceImage={path => replaceElementImage(path)}
          onEdit={editSlide}
          slideSelection={slideSelection}
          onSlideSelection={setSlideSelection}
          elementSelection={elementSelection}
          onElementSelection={setElementSelection}
          onDeleteElements={deleteElements}
          onSetElementStep={(path, step) => setStepFor(path, step)}
          material={material}
          previews={previews}
          onAddFiles={() => void addFilesFromDialog()}
          onPresent={() => {
            setPresentFrom(selectedSlide)
            setPresentOpen(true)
          }}
          onExport={() => setExportOpen(true)}
          onEditHtml={() => setHtmlOpen(true)}
          onAsk={askAboutSelection}
          asking={asking}
          status={lifecycle.doc.error ?? error ?? status}
          statusAction={statusAction}
          evidence={evidence}
          verification={verification}
          onLayout={noteLayout}
          onRecheck={() => void recheckLayout()}
          onHistory={() => setHistoryOpen(true)}
          revisionCount={revisions.entries.length}
        />
      ) : (
        <DocumentSwitcher
          appSlug={DECK_APP_SLUG}
          suffixes={[DECK_PACKAGE_SUFFIX]}
          variant="landing"
          previewStyle="grid"
          loadPreview={loadDeckPreview}
          onOpenDocument={(path: string) => void openDeckPath(path)}
          onCreateNew={() => void createNewDeck()}
          newLabel="New deck"
          title="Open a deck"
          itemNoun="deck"
          itemNounPlural="decks"
        />
      )}

      <DocumentSwitcher
        appSlug={DECK_APP_SLUG}
        suffixes={[DECK_PACKAGE_SUFFIX]}
        variant="modal"
        previewStyle="grid"
        loadPreview={loadDeckPreview}
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onOpenDocument={(path: string) => {
          setSwitcherOpen(false)
          void openDeckPath(path)
        }}
        onCreateNew={() => void createNewDeck()}
        newLabel="New deck"
        title="Open a deck"
        itemNoun="deck"
        itemNounPlural="decks"
      />
    </AppFrame>
  )
}
