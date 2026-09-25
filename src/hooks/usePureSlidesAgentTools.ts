/**
 * Registering the deck tools with the platform.
 *
 * Handlers read `contextRef.current`, so a tool called mid-export sees the
 * state as it is now rather than as it was when the drawer opened.
 */
import { useRef } from 'react'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentDeckToolError,
  PURESLIDES_AGENT_LOG_LABEL,
  PURESLIDES_AGENT_TOOLS,
  type DeckAgentToolContext,
} from '../agents/catalog'
import {
  addAssetHandler,
  addSlideHandler,
  checkDeckHandler,
  saveDeckHandler,
  createDeckHandler,
  deleteElementHandler,
  deleteSlideHandler,
  describeAssetHandler,
  draftDeckHandler,
  duplicateSlideHandler,
  exportDeckHandler,
  getDeckContextHandler,
  getSlideHandler,
  listAssetsHandler,
  listRevisionsHandler,
  listSlidesHandler,
  restoreRevisionHandler,
  moveSlideHandler,
  presentHandler,
  setAssetRoleHandler,
  setBriefHandler,
  setDeckHandler,
  addBlockHandler,
  listBlocksHandler,
  setElementHandler,
  setElementTextHandler,
  setElementStepHandler,
  setSelectionHandler,
  setSlideHtmlHandler,
  stopExportHandler,
  updateSlideHandler,
} from '../agents/handlers'

export function usePureSlidesAgentTools(
  ready: boolean,
  context: DeckAgentToolContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  usePlatformAgentTools({
    ready,
    tools: PURESLIDES_AGENT_TOOLS,
    logLabel: PURESLIDES_AGENT_LOG_LABEL,
    errorType: AgentDeckToolError,
    handlers: {
      cancelDrawerRequest: async invoke => ({
        content: JSON.stringify(
          await contextRef.current.cancelDrawerRequest(invoke.arguments ?? {}),
        ),
      }),
      getDeckContext: async () => getDeckContextHandler(contextRef.current),
      getSlide: async invoke =>
        getSlideHandler(contextRef.current, invoke.arguments ?? {}),
      listSlides: async () => listSlidesHandler(contextRef.current),
      listAssets: async () => listAssetsHandler(contextRef.current),
      checkDeck: async () => checkDeckHandler(contextRef.current),
      createDeck: async invoke =>
        createDeckHandler(contextRef.current, invoke.arguments ?? {}),
      setDeck: async invoke =>
        setDeckHandler(contextRef.current, invoke.arguments ?? {}),
      addSlide: async invoke =>
        addSlideHandler(contextRef.current, invoke.arguments ?? {}),
      updateSlide: async invoke =>
        updateSlideHandler(contextRef.current, invoke.arguments ?? {}),
      setSlideHtml: async invoke =>
        setSlideHtmlHandler(contextRef.current, invoke.arguments ?? {}),
      moveSlide: async invoke =>
        moveSlideHandler(contextRef.current, invoke.arguments ?? {}),
      duplicateSlide: async invoke =>
        duplicateSlideHandler(contextRef.current, invoke.arguments ?? {}),
      deleteSlide: async invoke =>
        deleteSlideHandler(contextRef.current, invoke.arguments ?? {}),
      setElement: async invoke =>
        setElementHandler(contextRef.current, invoke.arguments ?? {}),
      setElementText: async invoke =>
        setElementTextHandler(contextRef.current, invoke.arguments ?? {}),
      listBlocks: async () => listBlocksHandler(contextRef.current),
      addBlock: async invoke =>
        addBlockHandler(contextRef.current, invoke.arguments ?? {}),
      deleteElement: async invoke =>
        deleteElementHandler(contextRef.current, invoke.arguments ?? {}),
      setElementStep: async invoke =>
        setElementStepHandler(contextRef.current, invoke.arguments ?? {}),
      addAsset: async invoke =>
        addAssetHandler(contextRef.current, invoke.arguments ?? {}),
      setAssetRole: async invoke =>
        setAssetRoleHandler(contextRef.current, invoke.arguments ?? {}),
      describeAsset: async invoke =>
        describeAssetHandler(contextRef.current, invoke.arguments ?? {}),
      setBrief: async invoke =>
        setBriefHandler(contextRef.current, invoke.arguments ?? {}),
      getDrawerRequest: async () => ({
        content: JSON.stringify(await contextRef.current.getDrawerRequest()),
      }),
      commitDrawerRequest: async invoke => ({
        content: JSON.stringify(
          await contextRef.current.commitDrawerRequest(invoke.arguments ?? {}),
        ),
      }),
      draftDeck: async () => draftDeckHandler(contextRef.current),
      setSelection: async invoke =>
        setSelectionHandler(contextRef.current, invoke.arguments ?? {}),
      present: async invoke =>
        presentHandler(contextRef.current, invoke.arguments ?? {}),
      saveDeck: async () => saveDeckHandler(contextRef.current),
      exportDeck: async invoke =>
        exportDeckHandler(contextRef.current, invoke.arguments ?? {}),
      stopExport: async () => stopExportHandler(contextRef.current),
      listRevisions: async () => listRevisionsHandler(contextRef.current),
      restoreRevision: async invoke =>
        restoreRevisionHandler(contextRef.current, invoke.arguments ?? {}),
    },
  })
}
