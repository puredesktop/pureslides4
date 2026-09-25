/**
 * What the deck was before each rewrite.
 *
 * Every ask, agent update, draft and restore copies the deck AS IT WAS into
 * the package's history/ folder first (the kit's revision history: capped,
 * deduped, restore-current-first). This is that list, newest first, with
 * one verb — Restore — and the words that say what each entry is the state
 * before. A restore snapshots the current deck first, so it is itself
 * undoable.
 */
import { useEffect } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { revisionLabel, type RevisionEntry } from '@purescience/platform-ui/editing'
import { DECK_REASON_LABELS } from '../lib/deckDoor'

interface HistoryDialogProps {
  open: boolean
  onClose: () => void
  entries: RevisionEntry[]
  /** Visible text characters of the deck as it is now — the yardstick each entry is compared to. */
  currentTextChars: number
  onRestore: (file: string) => void
  busy: boolean
}

export function HistoryDialog({
  open,
  onClose,
  entries,
  currentTextChars,
  onRestore,
  busy,
}: HistoryDialogProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const now = Date.now()
  return (
    <Scrim onClick={onClose}>
      <Dialog onClick={event => event.stopPropagation()}>
        <Head>
          <Title>History</Title>
          <span style={{ flex: 1 }} />
          <Mono>{entries.length ? `${entries.length} kept` : 'nothing yet'}</Mono>
          <CloseButton type="button" onClick={onClose}>
            Close
          </CloseButton>
        </Head>
        <Note>
          Each entry is the deck as it was before a rewrite. Restore puts it back —
          the deck as it is now is kept first, so a restore can itself be undone.
        </Note>
        {entries.length ? (
          <List>
            {entries.map(entry => {
              const delta = entry.textChars - currentTextChars
              return (
                <Row key={entry.file}>
                  <RowText>
                    <RowLabel>{revisionLabel(entry, now, DECK_REASON_LABELS)}</RowLabel>
                    <RowMeta>
                      {entry.textChars.toLocaleString()} characters of text
                      {delta > 0 ? ` · ${delta.toLocaleString()} more than now` : ''}
                      {delta < 0 ? ` · ${Math.abs(delta).toLocaleString()} fewer than now` : ''}
                      {entry.scope ? ` · ${entry.scope}` : ''}
                    </RowMeta>
                  </RowText>
                  <RestoreButton type="button" disabled={busy} onClick={() => onRestore(entry.file)}>
                    Restore
                  </RestoreButton>
                </Row>
              )
            })}
          </List>
        ) : (
          <Empty>
            No revisions yet. One is kept before every ask, agent update and draft.
          </Empty>
        )}
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 34;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
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

const Note = styled.div`
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--platform-colors-text-secondary);
`

const Mono = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string): Record<string, string> => ({ 'data-chrome': kind })

const List = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--platform-colors-border);
`

/** One revision per platform list row; two lines of text, so it grows past 36. */
const Row = styled.div.attrs(chrome('list-row'))`
  && {
    padding: 8px 0;
  }
`

const RowText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`

const RowLabel = styled.span`
  font-size: var(--pure-chrome-ui-size);
`

const RowMeta = styled.span.attrs(chrome('meta'))`
  white-space: normal;
`

const RestoreButton = styled.button`
  padding: 6px 12px;
  border: 1px solid ${ACCENT};
  border-radius: 0;
  background: none;
  color: ${ACCENT};
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
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

const Empty = styled.div`
  padding: 18px 0;
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
`
