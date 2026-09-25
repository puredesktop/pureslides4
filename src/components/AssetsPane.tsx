import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { ASSET_ROLES, type MaterialItem } from '../lib/material'
import type { AssetRole } from '../lib/assetNotes'

interface AssetsPaneProps {
  material: MaterialItem[]
  /** Data URL per image file name, when it has been read. */
  previews: Record<string, string>
  brief: string
  busy: null | 'describing' | 'drafting'
  status: string
  onAddFiles: () => void
  /** Files dropped straight onto the pane — same path as Add files. */
  onDropFiles: (files: File[]) => void
  onDescribe: (name: string, description: string) => void
  onSetRole: (name: string, role: AssetRole) => void
  /** Put a clip on a new slide — the same door the addBlock tool uses. */
  onPlace?: (name: string) => void
  onDescribeAll: () => void
  onBrief: (brief: string) => void
  onDraft: () => void
}

function sizeLabel(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

export function AssetsPane({
  material,
  brief,
  busy,
  status,
  onAddFiles,
  onDropFiles,
  previews,
  onDescribe,
  onSetRole,
  onPlace,
  onDescribeAll,
  onBrief,
  onDraft,
}: AssetsPaneProps): React.ReactElement {
  const undescribed = material.filter(
    item => item.kind === 'image' && !item.description.trim(),
  )

  return (
    <Root>
      <Stage>
        <Head>
          <SectionHead>Files</SectionHead>
          <span />
          {undescribed.length ? (
            <Meta>
              {material.length} {material.length === 1 ? 'file' : 'files'} ·{' '}
              {undescribed.length} without a description
            </Meta>
          ) : (
            <Meta>
              {material.length} {material.length === 1 ? 'file' : 'files'}
            </Meta>
          )}
          {undescribed.length ? (
            <SmallButton
              type="button"
              disabled={busy !== null}
              onClick={onDescribeAll}
            >
              {busy === 'describing' ? 'Looking…' : 'Describe them for me'}
            </SmallButton>
          ) : null}
          <SmallButton type="button" onClick={onAddFiles}>
            Add files…
          </SmallButton>
        </Head>

        {material.length ? (
          <Grid>
            {material.map(item => (
              <Item key={item.name}>
                <Thumb $kind={item.kind}>
                  {previews[item.name] ? (
                    <ThumbImage src={previews[item.name]} alt={item.name} />
                  ) : item.kind === 'image' ? (
                    <ThumbName>{item.name}</ThumbName>
                  ) : (
                    <ThumbKind>{item.kind}</ThumbKind>
                  )}
                </Thumb>
                <DescriptionInput
                  value={item.description}
                  placeholder="What does this show?"
                  aria-label={`Description of ${item.name}`}
                  onChange={event =>
                    onDescribe(item.name, event.currentTarget.value)
                  }
                />
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
                <ItemFoot>
                  {item.described ? <Marker>described</Marker> : null}
                  {item.kind === 'video' && onPlace && (item.role ?? 'content') === 'content' ? (
                    <SmallButton type="button" onClick={() => onPlace(item.name)}>
                      Place on a slide
                    </SmallButton>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <Marker>{sizeLabel(item.bytes)}</Marker>
                </ItemFoot>
              </Item>
            ))}
          </Grid>
        ) : (
          <Dropzone
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              onDropFiles([...event.dataTransfer.files])
            }}
          >
            <DropTitle>Nothing attached yet</DropTitle>
            <DropBody>
              Screenshots, a logo, a font — whatever the deck is made from.
              Drop files here, or add them, and say what each one shows.
            </DropBody>
            <SmallButton type="button" onClick={onAddFiles}>
              Add files…
            </SmallButton>
          </Dropzone>
        )}

        {material.length ? (
          <Note>
            A description is what the deck gets written from. The model writes
            them by looking at each file; correct any that miss the point. A
            file marked <em>Design reference</em> never appears on screen — the
            piece is drawn to look like it instead.
          </Note>
        ) : null}
      </Stage>

      <Rail>
        <SectionHead>Brief</SectionHead>
        <BriefInput
          value={brief}
          placeholder="What is this deck for? Who sees it, and what should they take away?"
          onChange={event => onBrief(event.currentTarget.value)}
        />



        <span style={{ flex: 1 }} />

        <Actions>
          <PrimaryButton
            type="button"
            disabled={busy !== null}
            onClick={onDraft}
          >
            {busy === 'drafting' ? 'Drafting…' : 'Draft the slides'}
          </PrimaryButton>
          {status ? <Status>{status}</Status> : null}
        </Actions>
      </Rail>
    </Root>
  )
}

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'data-chrome': kind,
  ...extra,
})

const Root = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
`

const Stage = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;

  > span:nth-child(2) {
    flex: 1;
  }
`

const SectionHead = styled.h2.attrs(chrome('section-label'))`
  && {
    margin: 0;
    padding: 0;
  }
`

const Meta = styled.span.attrs(chrome('meta'))``

const Marker = styled.span.attrs(chrome('meta'))``

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
`

const Item = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

const Thumb = styled.div<{ $kind: string }>`
  height: 96px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: ${props =>
    props.$kind === 'image' ? 'var(--pure-chrome-well)' : 'var(--pure-chrome-surface)'};
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 8px;
`

const ThumbName = styled.span.attrs(chrome('meta'))`
  text-align: center;
  overflow-wrap: anywhere;
  white-space: normal;
`

/** Whole picture, not a crop: what it shows is the point of showing it. */
const ThumbImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`

const ThumbKind = styled.span.attrs(chrome('section-label'))`
  && {
    padding: 0;
  }
`

const DescriptionInput = styled.input.attrs(chrome('field'))`
  width: 100%;
`

/**
 * A role that is not the default is worth seeing at a glance — a reference
 * left set by mistake is otherwise invisible until it changes the whole look.
 */
const RoleSelect = styled.select<{ $set: boolean }>`
  width: 100%;
  height: var(--pure-chrome-control-height);
  padding: 0 8px;
  border: 1px solid
    ${props =>
      props.$set
        ? ACCENT
        : 'var(--pure-chrome-line)'};
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: ${props =>
    props.$set
      ? ACCENT
      : 'var(--pure-chrome-soft)'};
  font: inherit;
  font-size: 12px;
`

const ItemFoot = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Dropzone = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 26px;
  border: 1px dashed var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  max-width: 52ch;
`

const DropTitle = styled.h3`
  margin: 0;
  font-family: var(--platform-typography-font-family-content);
  font-size: 19px;
  font-weight: 500;
`

const DropBody = styled.p`
  margin: 0;
  font-size: var(--pure-chrome-ui-size);
  line-height: 1.55;
  color: var(--pure-chrome-soft);
`

const Note = styled.p`
  margin: 0;
  font-size: var(--pure-chrome-ui-size);
  line-height: 1.5;
  color: var(--pure-chrome-soft);
`

const Status = styled.p.attrs(chrome('meta'))`
  margin: 0;
  white-space: normal;
`

/** The brief lives in the platform's right sidebar. */
const Rail = styled.aside.attrs(chrome('sidebar', { 'data-side': 'right' }))`
  gap: 14px;
  padding: 12px var(--pure-chrome-inset) 16px;
`

/** Prose that is written: the content face at the reading size. */
const BriefInput = styled.textarea`
  min-height: 128px;
  resize: vertical;
  padding: 11px 12px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  font-family: var(--platform-typography-font-family-content);
  font-size: var(--pure-chrome-reading-size);
  line-height: var(--pure-chrome-reading-line);
`





const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid var(--pure-chrome-line);
  padding-top: 14px;
`

const PrimaryButton = styled.button`
  border: 1px solid ${ACCENT};
  border-radius: 7px;
  background: ${ACCENT};
  color: var(--pure-chrome-on-accent);
  padding: 8px 16px;
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const SmallButton = styled.button`
  height: var(--pure-chrome-control-height);
  border: 1px solid var(--pure-chrome-line);
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  padding: 0 11px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`
