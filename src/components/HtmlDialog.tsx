/**
 * The escape hatch.
 *
 * There used to be a whole HTML view; everything it held now lives in the
 * storyboard, the preview window or the export dialog — except this. The raw
 * markup matters most exactly when the structured views fail: a composition
 * the storyboard cannot read is one you can only fix by looking at what is
 * actually there. So the source stays reachable, as a dialog rather than a
 * destination.
 *
 * Edits land through the door once typing settles (and on blur), not per
 * keystroke: every landed edit re-renders every frame and takes its place
 * in the history, and a half-typed tag is neither a revision nor a deck.
 * The dialog remembers which version it is editing; if the deck moved
 * underneath it — an agent, an ask — the commit is refused in plain words
 * and the text is re-synced to the current document.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'

/** How long typing has to settle before the source lands as an edit. */
export const HTML_DIALOG_SETTLE_MS = 500

export interface HtmlCommitResult {
  ok: boolean
  /** The refusal's words when `ok` is false. */
  message?: string
}

interface HtmlDialogProps {
  open: boolean
  onClose: () => void
  html: string
  /** The hash of `html` — what a commit names as its base. */
  hash: string
  onCommit: (html: string, baseHash: string) => HtmlCommitResult
}

export function HtmlDialog({
  open,
  onClose,
  html,
  hash,
  onCommit,
}: HtmlDialogProps): React.ReactElement | null {
  const [text, setText] = useState(html)
  // The version the text was last synced from — the base every commit names.
  const [baseHash, setBaseHash] = useState(hash)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const textRef = useRef(text)
  textRef.current = text
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const baseRef = useRef(baseHash)
  baseRef.current = baseHash
  // The settle timer fires later than the keystroke that armed it; it must
  // commit against the props as they are THEN, not as they were.
  const commitRef = useRef<() => void>(() => undefined)

  // Outside changes (an agent, an ask, an undo) show up while nothing is
  // half-typed; a dirty editor keeps its text and its base, and the commit
  // decides.
  useEffect(() => {
    if (dirtyRef.current) return
    setText(html)
    setBaseHash(hash)
  }, [html, hash])

  const commit = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return
    const result = onCommit(textRef.current, baseRef.current)
    setDirty(false)
    if (!result.ok) {
      setNotice(result.message ?? 'The edit was not applied.')
      // The editor now shows the current version.
      setText(html)
      setBaseHash(hash)
      return
    }
    setNotice(null)
  }, [onCommit, html, hash])
  commitRef.current = commit

  const change = useCallback(
    (next: string): void => {
      setText(next)
      setDirty(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        commitRef.current()
      }, HTML_DIALOG_SETTLE_MS)
    },
    [],
  )

  const close = useCallback((): void => {
    commit()
    onClose()
  }, [commit, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  if (!open) return null
  return (
    <Scrim onClick={close}>
      <Dialog onClick={event => event.stopPropagation()}>
        <Head>
          <Title>The document</Title>
          <span style={{ flex: 1 }} />
          <Note>{dirty ? 'Applies when you pause.' : 'Edits apply when you pause typing.'}</Note>
          <CloseButton type="button" onClick={close}>
            Close
          </CloseButton>
        </Head>
        {notice ? <Notice role="status">{notice}</Notice> : null}
        <Editor
          value={text}
          spellCheck={false}
          aria-label="Composition HTML"
          onChange={event => change(event.currentTarget.value)}
          onBlur={commit}
        />
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 35;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(880px, calc(100vw - 48px));
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.28);
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const Title = styled.h2`
  margin: 0;
  font-size: 16px;
`

const Note = styled.span`
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
`

const Notice = styled.div`
  padding: 8px 10px;
  border: 1px solid var(--platform-colors-danger, #b4340e);
  font-size: 12px;
  color: var(--platform-colors-danger, #b4340e);
`

const CloseButton = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const Editor = styled.textarea`
  flex: 1;
  min-height: 0;
  resize: none;
  padding: 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
`
