/**
 * Starting a deck, as four questions instead of a screen.
 *
 * A new piece needs a brief, its material, and a shape — so a fresh deck
 * opens on exactly that, and nothing else. Create hands everything to
 * drafting and lands you on the board with real slides; Start empty lands
 * you on the board with the starter slide. Either way the answers are
 * stored in the package — the wizard is a doorway, not a place.
 */
import { useEffect } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { ASSET_ROLES, type MaterialItem } from '../lib/material'
import type { AssetRole } from '../lib/assetNotes'
import type { DeckGeometry } from '../types'

const FRAMES = [
  { id: '16-9', label: '16:9', width: 1280, height: 720, note: 'Projectors and laptops' },
  { id: '4-3', label: '4:3', width: 1024, height: 768, note: 'Older rooms' },
  { id: 'a4', label: 'A4', width: 1123, height: 794, note: 'A deck meant to be read on paper' },
]

/**
 * Where the look comes from.
 *
 * Auto is first and default: a deck built from someone's own screenshots and
 * logo should look like their work without them choosing a theme. The presets
 * are there for when there is nothing to read a look off, or when they would
 * rather decide it themselves.
 */
const LOOKS = [
  { id: 'auto', label: 'Auto', note: 'Read off the files you attach' },
  { id: 'ink', label: 'Ink', note: 'Dark, high contrast' },
  { id: 'paper', label: 'Paper', note: 'Light, editorial' },
  { id: 'signal', label: 'Signal', note: 'White with one accent' },
]

interface NewDeckWizardProps {
  open: boolean
  brief: string
  onBrief: (brief: string) => void
  slideCount: number
  onSlideCount: (slides: number) => void
  geometry: DeckGeometry
  look: string
  onLook: (look: string) => void
  onFormat: (width: number, height: number) => void
  material: MaterialItem[]
  previews: Record<string, string>
  onAddFiles: () => void
  onSetRole: (name: string, role: AssetRole) => void
  busy: boolean
  busyLabel: string
  onCreate: () => void
  onSkip: () => void
  onCancel: () => void
}

export function NewDeckWizard({
  open,
  brief,
  onBrief,
  slideCount,
  onSlideCount,
  look,
  onLook,
  geometry,
  onFormat,
  material,
  previews,
  onAddFiles,
  onSetRole,
  busy,
  busyLabel,
  onCreate,
  onSkip,
  onCancel,
}: NewDeckWizardProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null
  const activeFormat = FRAMES.find(
    frame => frame.width === geometry.width && frame.height === geometry.height,
  )

  return (
    <Scrim>
      <Dialog>
        <Title>New deck</Title>

        <Field>
          <Label htmlFor="wizard-brief">What is it for?</Label>
          <Brief
            id="wizard-brief"
            value={brief}
            autoFocus
            placeholder="Who sees this, and what should they take away?"
            onChange={event => onBrief(event.currentTarget.value)}
          />
        </Field>

        <Field>
          <Label>Files</Label>
          {material.length ? (
            <Files>
              {material.map(item => (
                <FileChip key={item.name} title={item.name}>
                  {previews[item.name] ? (
                    <FileThumb src={previews[item.name]} alt="" />
                  ) : (
                    <FileKind>{item.kind}</FileKind>
                  )}
                  <FileName title={item.name}>{item.name}</FileName>
                  <RoleSelect
                    value={item.role ?? 'content'}
                    aria-label={`What ${item.name} is for`}
                    $set={(item.role ?? 'content') !== 'content'}
                    onChange={event =>
                      onSetRole(item.name, event.currentTarget.value as AssetRole)
                    }
                  >
                    {ASSET_ROLES.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </RoleSelect>
                </FileChip>
              ))}
            </Files>
          ) : (
            <Hint>
              Screenshots, a logo, a font — whatever the deck is made from.
              You can add more later.
            </Hint>
          )}
          <div>
            <GhostButton type="button" disabled={busy} onClick={onAddFiles}>
              Add files…
            </GhostButton>
          </div>
        </Field>

        <TwoUp>
          <Field>
            <Label htmlFor="wizard-slides">Slides (about)</Label>
            <Input
              id="wizard-slides"
              type="number"
              min={1}
              max={120}
              value={slideCount}
              onChange={event => onSlideCount(Number(event.currentTarget.value))}
            />
          </Field>
          <Field>
            <Label>Frame</Label>
            <Formats>
              {FRAMES.map(frame => (
                <FormatButton
                  key={frame.id}
                  type="button"
                  title={frame.note}
                  $active={activeFormat?.id === frame.id}
                  onClick={() => onFormat(frame.width, frame.height)}
                >
                  {frame.label}
                </FormatButton>
              ))}
            </Formats>
          </Field>
        </TwoUp>

        <Field>
          <Label>Look</Label>
          <Looks>
            {LOOKS.map(option => (
              <LookButton
                key={option.id}
                type="button"
                title={option.note}
                $active={look === option.id}
                onClick={() => onLook(option.id)}
              >
                <LookName>{option.label}</LookName>
                <LookNote>{option.note}</LookNote>
              </LookButton>
            ))}
          </Looks>
          <Hint>
            A file marked <em>design reference</em> always wins — the deck is
            drawn to match it.
          </Hint>
        </Field>

        <Actions>
          <GhostButton type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </GhostButton>
          <GhostButton type="button" disabled={busy} onClick={onSkip}>
            Start empty
          </GhostButton>
          <span style={{ flex: 1 }} />
          <PrimaryButton
            type="button"
            disabled={busy || (!brief.trim() && !material.length)}
            onClick={onCreate}
          >
            {busy ? busyLabel : 'Create'}
          </PrimaryButton>
        </Actions>
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.5);
`

const Dialog = styled.div`
  /* Wide enough that the material reads as material — thumbnails big enough
     to recognise, and a role next to each one — rather than a row of stamps. */
  width: min(760px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.3);
`

const Title = styled.h2`
  margin: 0;
  font-size: 19px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
`

const Brief = styled.textarea`
  min-height: 84px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.5;
`

const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 13px;
`

const TwoUp = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
`

const Formats = styled.div`
  display: flex;
  gap: 6px;
`

const FormatButton = styled.button<{ $active?: boolean }>`
  padding: 8px 12px;
  border: 1px solid
    ${props =>
      props.$active ? ACCENT : 'var(--platform-colors-border)'};
  border-radius: 0;
  background: ${props =>
    props.$active ? ACCENT : 'var(--platform-colors-surface)'};
  color: ${props => (props.$active ? 'var(--pure-chrome-on-accent)' : 'var(--platform-colors-text)')};
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const Files = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
`

const FileChip = styled.div`
  flex: none;
  width: 132px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const FileThumb = styled.img`
  width: 132px;
  height: 78px;
  object-fit: contain;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const FileKind = styled.span`
  width: 132px;
  height: 78px;
  display: grid;
  place-items: center;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--platform-colors-text-secondary);
`

const RoleSelect = styled.select<{ $set: boolean }>`
  width: 100%;
  padding: 4px 6px;
  border: 1px solid
    ${props =>
      props.$set
        ? ACCENT
        : 'var(--platform-colors-border)'};
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: ${props =>
    props.$set
      ? ACCENT
      : 'var(--platform-colors-text-secondary)'};
  font: inherit;
  font-size: 11px;
`

const FileName = styled.span`
  font-size: 9px;
  color: var(--platform-colors-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Hint = styled.div`
  font-size: 12.5px;
  color: var(--platform-colors-text-secondary);
`

const Looks = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
`

const LookButton = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 9px;
  border: 1px solid
    ${props =>
      props.$active ? ACCENT : 'var(--platform-colors-border)'};
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
`

const LookName = styled.span`
  font-size: 12px;
  font-weight: 600;
`

const LookNote = styled.span`
  font-size: 9.5px;
  line-height: 1.25;
  color: var(--platform-colors-text-secondary);
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const PrimaryButton = styled.button`
  padding: 10px 18px;
  border: 0;
  border-radius: 0;
  background: ${ACCENT};
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const GhostButton = styled.button`
  padding: 8px 14px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
`
