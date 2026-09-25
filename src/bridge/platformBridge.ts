// The single bridge surface for PureSlides4. Components never call
// `bridge.call` directly; every shell capability this app uses is a named
// helper here, and method names always come from `PLATFORM_BRIDGE_METHODS`.
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import {
  createPlatformFolder,
  deletePlatformFile,
  listPlatformFiles,
  readPlatformFileBinary,
  readPlatformFileBinaryDataUrl,
  readPlatformTextFile,
  writePlatformFileBinary,
  writePlatformTextFile,
} from '@purescience/platform-ui/bridge/fs'
import {
  captureFrameSequence,
  renderCancel,
} from '@purescience/platform-ui/bridge/render'

export { bridge }

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

// ---- Files ---------------------------------------------------------------

export async function readTextFile(path: string): Promise<string> {
  return readPlatformTextFile(path)
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await writePlatformTextFile(path, content)
}

/** Read a rendered frame back as a data URL so it can be decoded for encoding. */
export async function readBinaryDataUrl(
  path: string,
  maxBytes?: number,
): Promise<string> {
  return readPlatformFileBinaryDataUrl(path, maxBytes)
}

export async function writeBinaryFile(
  path: string,
  base64: string,
): Promise<void> {
  await writePlatformFileBinary(path, base64)
}

/** List a folder — used to report what is in a package's `assets/`. */
export async function listFiles(path: string): Promise<unknown> {
  return listPlatformFiles(path)
}

/** Read a file's bytes as base64, for copying an asset into a package. */
export async function readBinaryBase64(
  path: string,
  maxBytes?: number,
): Promise<{ base64: string; mimeType: string; byteLength?: number }> {
  return readPlatformFileBinary(path, maxBytes) as Promise<{
    base64: string
    mimeType: string
    byteLength?: number
  }>
}

export async function createFolder(
  parentPath: string,
  name: string,
): Promise<void> {
  await createPlatformFolder(parentPath, name)
}

export async function deletePath(
  path: string,
  recursive = true,
): Promise<void> {
  await deletePlatformFile(path, recursive)
}

// ---- Render --------------------------------------------------------------

/**
 * Capture many instants of one document in a single page load — the whole
 * render, in one call. The page exposes `__frameSeek`, which the injected
 * seek script defines.
 */
export async function captureFrames(request: {
  htmlPath: string
  outputDir: string
  times: number[]
  seekFunction?: string
  namePattern?: string
  width?: number
  settleMs?: number
  loadingMessage?: string
}): Promise<{ frames: string[]; width: number; height: number }> {
  return captureFrameSequence(request) as Promise<{
    frames: string[]
    width: number
    height: number
  }>
}

/**
 * Print a prepared HTML document to PDF (shell: Paged.js + printToPDF).
 *
 * The deck's own pages go in already sized, so pagination has only to honour
 * the breaks it is given — no new shell primitive was needed for this.
 */
export async function printHtml(request: {
  htmlPath: string
  outputPath: string
  basePath?: string
  pageSize?: string
  margins?: string
  loadingMessage?: string
  paginate?: 'pagedjs' | 'browser'
}): Promise<string> {
  return (await bridge.call(PLATFORM_BRIDGE_METHODS.RENDER_PRINT_HTML, [
    request,
  ])) as string
}

/**
 * Ask the shell to stop the render in flight. It stops between frames and
 * keeps what it has already captured.
 */
export async function cancelShellRender(): Promise<void> {
  await renderCancel()
}

/** Progress events from a running shell-side render. */
export { onRenderProgress } from '@purescience/platform-ui/bridge/render'

// ---- Workspace -----------------------------------------------------------

/** Reveal a finished render in PureFiles. */
export async function revealPath(path: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.OS_REVEAL, [path])
}

// ---- Operations ledger ----------------------------------------------------
// Suite-wide record of user and agent interactions (root AGENTS.md
// "Operations ledger"). Renders are long, explicit and produce a file, so
// they are recorded here as well as centrally for approval-gated tools.
import { recordPlatformOperation as recordPlatformOperationBridge } from '@purescience/platform-ui/bridge/operations'
import type {
  PlatformOperation,
  PlatformOperationInput,
} from '@purescience/platform-ui/bridge/operations'

export type { PlatformOperation, PlatformOperationInput }

/** Record one interaction into the ledger (the shell pins appSlug to this app). */
export async function recordOperation(
  input: PlatformOperationInput,
): Promise<PlatformOperation | null> {
  if (isStandaloneDevMode()) return null
  return recordPlatformOperationBridge(input)
}
