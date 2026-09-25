/**
 * The board — which IS the app.
 *
 * PureVideo's storyboard runs left to right because a video is a timeline.
 * A deck is a stack, so the strip runs DOWN: that is the whole difference in
 * the paradigm, and everything else carries over — the strip is the markup,
 * every operation is an HTML transform, and the stage shows a real slide
 * rather than a picture of one.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { SlideFrame } from './SlideFrame'
import { readElement } from '../lib/slides'
import { deckSeconds } from '../lib/deckDocument'
import type { Slide, SlideEdit } from '../lib/slides'
import { blockCatalogue } from '../lib/blocks'
import type { BoardTab, DeckGeometry, PickedElement } from '../types'
import type { MaterialItem } from '../lib/material'
import type { DeckVerification, LayoutReport, SlideEvidenceMap } from '../lib/deckVerification'

/** One verb offered beside the status line — Undo after a revision, Retry after a refused ask. */
export interface StatusAction {
  label: string
  run: () => void
}

interface SlideBoardViewProps {
  html: string
  slides: Slide[]
  geometry: DeckGeometry
  tab: BoardTab
  onTab: (tab: BoardTab) => void
  assetsPane: React.ReactNode
  selected: number
  onSelect: (index: number) => void
  onMove: (from: number, to: number) => void
  onDuplicate: (index: number) => void
  onDelete: (index: number) => void
  onAdd: (blockId?: string) => void
  onElementText: (path: string, text: string) => void
  /** Typing in the slide itself: the edited element arrives serialized, with the html it was typed into. */
  onEditElement: (slide: number, path: string, outerHtml: string, html: string) => void
  onReplaceImage: (path: string) => void
  onEdit: (index: number, patch: SlideEdit) => void
  slideSelection: number[]
  onSlideSelection: (indexes: number[]) => void
  elementSelection: PickedElement[]
  onElementSelection: (picked: PickedElement[]) => void
  onDeleteElements: (paths: string[]) => void
  onSetElementStep: (path: string, step: number) => void
  material: MaterialItem[]
  previews: Record<string, string>
  onAddFiles: () => void
  onPresent: () => void
  onExport: () => void
  onEditHtml: () => void
  onAsk: (request: string) => void
  asking: boolean
  status: string
  statusAction?: StatusAction | null
  /** What every frame has measured, keyed by slide — the card badge reads it. */
  evidence: SlideEvidenceMap
  /** The deck's state from that evidence — the header reads it. */
  verification: DeckVerification
  onLayout: (slide: number, report: LayoutReport, html: string) => void
  /** Measure every slide now, in a frame of the app's own. */
  onRecheck: () => void
  onHistory: () => void
  revisionCount: number
}

export function SlideBoardView({
  html,
  slides,
  geometry,
  tab,
  onTab,
  assetsPane,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
  onAdd,
  onElementText,
  onEditElement,
  onReplaceImage,
  onEdit,
  slideSelection,
  onSlideSelection,
  elementSelection,
  onElementSelection,
  onDeleteElements,
  onSetElementStep,
  material,
  previews,
  onAddFiles,
  onPresent,
  onExport,
  onEditHtml,
  onAsk,
  asking,
  status,
  statusAction = null,
  evidence,
  verification,
  onLayout,
  onRecheck,
  onHistory,
  revisionCount,
}: SlideBoardViewProps): React.ReactElement {
  const slide: Slide | undefined = slides[selected] ?? slides[0]
  const [request, setRequest] = useState('')
  const [step, setStep] = useState(0)
  const [picking, setPicking] = useState(false)
  /**
   * Dragging a card. `dropBefore` is a GAP, not a card: 0 is above the first
   * slide and slides.length is below the last, which is the only way to
   * express "put it at the end" without a special case.
   */
  const [picker, setPicker] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  // Overlaps the fit could not separate, reported by whichever frame rendered
  // the slide. The app keeps the evidence (it gates export on it); the card
  // and the stage read the count off it so the two agree.
  const overlaps = (index: number): number => evidence[index]?.overlaps ?? 0
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropBefore, setDropBefore] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Moving to another slide starts its build at the top and drops picks that
  // addressed the slide you just left.
  useEffect(() => {
    setStep(0)
    onElementSelection([])
  }, [selected, onElementSelection])

  useEffect(() => {
    const card = stripRef.current?.querySelector(`[data-slide-card="${selected}"]`)
    card?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // Escape closes the block picker, the way it closes every other overlay.
  useEffect(() => {
    if (!picker) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPicker(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picker])

  const pickElement = useCallback(
    (path: string, label: string, additive: boolean, from: number): void => {
      if (from !== selected) {
        onSelect(from)
        onElementSelection([{ path, label }])
        return
      }
      const already = elementSelection.some(item => item.path === path)
      if (already) {
        onElementSelection(elementSelection.filter(item => item.path !== path))
        return
      }
      onElementSelection(
        additive ? [...elementSelection, { path, label }] : [{ path, label }],
      )
    },
    [elementSelection, onElementSelection, onSelect, selected],
  )

  /**
   * Where a drop lands.
   *
   * `moveSlide` takes an index into the list with the dragged slide already
   * removed, so a gap BELOW the dragged card is one lower than it looks —
   * without this the slide lands one place short of where it was dropped.
   */
  const dropAt = useCallback(
    (gap: number, from: number): number => (gap > from ? gap - 1 : gap),
    [],
  )

  const endDrag = useCallback(() => {
    setDragging(null)
    setDropBefore(null)
  }, [])

  const submitAsk = useCallback((): void => {
    const text = request.trim()
    if (!text || asking) return
    onAsk(text)
    setRequest('')
  }, [request, asking, onAsk])

  const toggleSlide = useCallback(
    (index: number): void => {
      onSlideSelection(
        slideSelection.includes(index)
          ? slideSelection.filter(item => item !== index)
          : [...slideSelection, index].sort((a, b) => a - b),
      )
    },
    [slideSelection, onSlideSelection],
  )

  if (!slides.length) {
    return (
      <Root>
        <Empty>
          <EmptyTitle>No slides yet</EmptyTitle>
          <EmptyBody>
            A slide is a direct child of the deck root carrying data-slide. Add
            one, or ask the assistant to draft the deck.
          </EmptyBody>
          <PrimaryButton type="button" onClick={() => setPicker(true)}>
            Add a slide
          </PrimaryButton>
        </Empty>
      </Root>
    )
  }

  // What a request would reach, said before it is sent: elements beat ticked
  // slides, ticked slides beat the one on screen.
  const scopeHead = elementSelection.length
    ? elementSelection.length === 1
      ? 'Change this element'
      : `Change these ${elementSelection.length} elements`
    : slideSelection.length > 1
      ? slideSelection.length === slides.length
        ? 'Change the whole deck'
        : `Change these ${slideSelection.length} slides`
      : 'Change this slide'
  const scopeHint = elementSelection.length
    ? 'Only what you picked changes.'
    : slideSelection.length > 1
      ? `Slides ${slideSelection.map(index => index + 1).join(', ')} change together.`
      : 'Only this slide changes.'

  return (
    <Root>
      {picker ? (
        <PickerScrim onClick={() => setPicker(false)}>
          <PickerBox onClick={event => event.stopPropagation()}>
            <PickerHead>
              <SectionHead>Add a slide</SectionHead>
              <span style={{ flex: 1 }} />
              <Faint>Pick a shape — then edit it like any other slide.</Faint>
            </PickerHead>
            <PickerGrid>
              {blockCatalogue().map(block => (
                <PickerCard
                  key={block.id}
                  type="button"
                  onClick={() => {
                    onAdd(block.id)
                    setPicker(false)
                  }}
                >
                  <PickerName>{block.label}</PickerName>
                  <PickerNote>{block.description}</PickerNote>
                  {block.steps ? (
                    <PickerSteps>
                      builds in {block.steps} {block.steps === 1 ? 'step' : 'steps'}
                    </PickerSteps>
                  ) : null}
                </PickerCard>
              ))}
            </PickerGrid>
          </PickerBox>
        </PickerScrim>
      ) : null}
      <Stage>
        <Toolbar>
          <Tabs role="tablist" aria-label="Board">
            <TabButton
              type="button"
              role="tab"
              aria-selected={tab === 'slides'}
              data-active={tab === 'slides' ? '' : undefined}
              onClick={() => onTab('slides')}
            >
              Slides
            </TabButton>
            <TabButton
              type="button"
              role="tab"
              aria-selected={tab === 'assets'}
              data-active={tab === 'assets' ? '' : undefined}
              onClick={() => onTab('assets')}
            >
              Files
            </TabButton>
          </Tabs>
          <span style={{ flex: 1 }} />
          <Meta>
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'} ·{' '}
            {geometry.width}×{geometry.height}
            {slides.some(item => item.notes) ? ' · notes' : ''}
          </Meta>
          <VerifyBadge
            type="button"
            $state={verification.state}
            onClick={onRecheck}
            title={
              verification.state === 'verified'
                ? 'Every slide measured cleanly with its fonts loaded. Click to measure again.'
                : verification.state === 'failed'
                  ? `${verification.message}. Scaling cannot fix overlapping text — change the layout. Click to measure again.`
                  : 'Slides are measured as they render; a hidden frame or a font still loading is never trusted. Click to measure every slide now.'
            }
          >
            {verification.message}
          </VerifyBadge>
          <HtmlButton
            type="button"
            onClick={onHistory}
            title="What the deck was before each rewrite — restore any of them"
          >
            History{revisionCount ? ` ${revisionCount}` : ''}
          </HtmlButton>
          <HtmlButton type="button" onClick={onEditHtml} title="The raw document — edits apply when you pause typing">
            HTML
          </HtmlButton>
          <PresentButton type="button" onClick={onPresent}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1.5l8 4.5-8 4.5z" />
            </svg>
            Present
          </PresentButton>
          <ExportButton type="button" onClick={onExport}>
            Export…
          </ExportButton>
        </Toolbar>

        {tab === 'assets' ? (
          <AssetsPane>{assetsPane}</AssetsPane>
        ) : (
          <Body>
            <Strip
              ref={stripRef}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault()
                if (dragging !== null && dropBefore !== null) {
                  const to = dropAt(dropBefore, dragging)
                  if (to !== dragging) onMove(dragging, to)
                }
                endDrag()
              }}
            >
              {slides.map(item => (
                <CardSlot key={item.index}>
                  {dropBefore === item.index ? <DropLine /> : null}
                <Card
                  data-slide-card={item.index}
                  type="button"
                  draggable
                  $selected={item.index === selected}
                  $dragging={dragging === item.index}
                  onClick={() => onSelect(item.index)}
                  onDragStart={event => {
                    setDragging(item.index)
                    event.dataTransfer.effectAllowed = 'move'
                    // Firefox refuses to start a drag without payload.
                    event.dataTransfer.setData('text/plain', String(item.index))
                  }}
                  onDragEnd={endDrag}
                  onDragOver={event => {
                    event.preventDefault()
                    if (dragging === null) return
                    const box = event.currentTarget.getBoundingClientRect()
                    const below = event.clientY > box.top + box.height / 2
                    setDropBefore(below ? item.index + 1 : item.index)
                  }}
                >
                  <CardFrame $selected={item.index === selected}>
                    <SlideFrame
                      html={html}
                      slide={item.index}
                      step={item.steps}
                      geometry={geometry}
                      width={168}
                      previews={previews}
                      onLayout={onLayout}
                    />
                    {overlaps(item.index) ? <CardWarn title="Content overlaps on this slide" /> : null}
                    <CardBadge $selected={item.index === selected}>
                      {String(item.index + 1).padStart(2, '0')}
                    </CardBadge>
                    <CardTick
                      role="checkbox"
                      aria-checked={slideSelection.includes(item.index)}
                      aria-label={`Include slide ${item.index + 1} in the next request`}
                      tabIndex={0}
                      $on={slideSelection.includes(item.index)}
                      onClick={event => {
                        event.stopPropagation()
                        toggleSlide(item.index)
                      }}
                      onKeyDown={event => {
                        if (event.key !== ' ' && event.key !== 'Enter') return
                        event.preventDefault()
                        event.stopPropagation()
                        toggleSlide(item.index)
                      }}
                    >
                      {slideSelection.includes(item.index) ? '✓' : ''}
                    </CardTick>
                    <CardMarks>
                      {item.steps ? (
                        <Mark title={`builds in ${item.steps} steps`}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
                            <path d="M2 9.5h2.5M2 6.5h5M2 3.5h8" />
                          </svg>
                        </Mark>
                      ) : null}
                      {item.notes ? (
                        <Mark title="has speaker notes">
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
                            <path d="M2 2.5h8v6H5.5L3 10.5v-2H2z" />
                          </svg>
                        </Mark>
                      ) : null}
                    </CardMarks>
                  </CardFrame>
                  <CardLabel $selected={item.index === selected}>
                    {item.headline || `Slide ${item.index + 1}`}
                  </CardLabel>
                </Card>
                </CardSlot>
              ))}
              {dropBefore === slides.length ? <DropLine /> : null}
              <AddCard
                type="button"
                onClick={() => setPicker(true)}
                onDragOver={event => {
                  event.preventDefault()
                  if (dragging !== null) setDropBefore(slides.length)
                }}
              >
                + Add a slide
              </AddCard>
            </Strip>

            {slide ? (
              <Selected>
                <SelectedStage>
                  <SlideFrame
                    html={html}
                    slide={slide.index}
                    step={step}
                    geometry={geometry}
                    width={620}
                    previews={previews}
                    live
                    dropTarget
                    picking={picking}
                    highlight={elementSelection.map(item => item.path)}
                    onPick={pickElement}
                    onEdit={onEditElement}
                    onLayout={onLayout}
                  />
                </SelectedStage>
                <Transport>
                  {slide.steps ? (
                    <>
                      <TransportButton
                        type="button"
                        aria-label="Back a step"
                        disabled={step === 0}
                        onClick={() => setStep(value => Math.max(0, value - 1))}
                      >
                        ‹
                      </TransportButton>
                      <StepButton
                        type="button"
                        onClick={() =>
                          setStep(value => (value >= slide.steps ? 0 : value + 1))
                        }
                      >
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2.5 1.5l8 4.5-8 4.5z" />
                        </svg>
                        Play slide
                      </StepButton>
                      <Dots>
                        {Array.from({ length: slide.steps + 1 }, (_unused, index) => (
                          <Dot
                            key={index}
                            $on={index <= step}
                            role="button"
                            aria-label={`Step ${index}`}
                            onClick={() => setStep(index)}
                          />
                        ))}
                      </Dots>
                      <Mono>
                        step {step} of {slide.steps}
                      </Mono>
                    </>
                  ) : (
                    <Mono>No build — everything is on at once</Mono>
                  )}
                  {overlaps(slide.index) ? (
                    <Warn title="Two elements that both carry content are sitting on top of each other. Scaling cannot fix this — the slide's layout has to change.">
                      {overlaps(slide.index)} overlapping
                    </Warn>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <PickToggle type="button" $on={picking} onClick={() => setPicking(!picking)}>
                    {picking ? 'Picking elements' : 'Pick elements'}
                  </PickToggle>
                </Transport>
              </Selected>
            ) : null}
            <Foot>
              <StatusLine>{status}</StatusLine>
              {statusAction ? (
                <StatusButton type="button" onClick={statusAction.run}>
                  {statusAction.label}
                </StatusButton>
              ) : null}
            </Foot>
          </Body>
        )}
      </Stage>

      {tab === 'slides' && slide ? (
        <Rail>
          <StageHead>
            <SectionHead>Slide {String(slide.index + 1).padStart(2, '0')}</SectionHead>
            <span style={{ flex: 1 }} />
            <Meta>{slide.block || 'slide'}</Meta>
          </StageHead>

          <Ops>
            <OpButton type="button" disabled={slide.index === 0} onClick={() => onMove(slide.index, slide.index - 1)}>
              ↑ Move
            </OpButton>
            <OpButton
              type="button"
              disabled={slide.index === slides.length - 1}
              onClick={() => onMove(slide.index, slide.index + 1)}
            >
              ↓ Move
            </OpButton>
            <OpButton type="button" onClick={() => onDuplicate(slide.index)}>
              Duplicate
            </OpButton>
            <OpButton
              type="button"
              $danger
              disabled={slides.length <= 1}
              title={slides.length <= 1 ? 'A deck keeps at least one slide' : undefined}
              onClick={() => onDelete(slide.index)}
            >
              Delete
            </OpButton>
          </Ops>

          <Field>
            <label htmlFor="slide-headline">Headline</label>
            <input
              id="slide-headline"
              data-chrome="field"
              value={slide.headline}
              onChange={event => onEdit(slide.index, { headline: event.currentTarget.value })}
            />
          </Field>
          <Field>
            <label htmlFor="slide-support">Support line</label>
            <input
              id="slide-support"
              data-chrome="field"
              value={slide.support}
              onChange={event => onEdit(slide.index, { support: event.currentTarget.value })}
            />
          </Field>
          <Field>
            <label htmlFor="slide-seconds">
              Seconds <Faint>— how long it holds in a video export</Faint>
            </label>
            <input
              id="slide-seconds"
              data-chrome="field"
              type="number"
              min={1}
              step={1}
              value={slide.seconds}
              onChange={event => {
                const seconds = Number(event.currentTarget.value)
                if (Number.isFinite(seconds) && seconds > 0) {
                  onEdit(slide.index, { seconds })
                }
              }}
            />
            <Faint>
              The whole deck runs {deckSeconds(slides.map(item => item.seconds))}s
              as video.
            </Faint>
          </Field>
          <Field>
            <label htmlFor="slide-notes">
              Speaker notes <Faint>— presenter view only</Faint>
            </label>
            <textarea
              id="slide-notes"
              rows={3}
              value={slide.notes}
              placeholder="What you say while this is up…"
              onChange={event => onEdit(slide.index, { notes: event.currentTarget.value })}
            />
          </Field>

          <AskBlock>
            <SectionHead>{scopeHead}</SectionHead>
            <Scope>
              <ScopeButton
                type="button"
                $on={slideSelection.length === slides.length}
                onClick={() =>
                  onSlideSelection(
                    slideSelection.length === slides.length
                      ? []
                      : slides.map(item => item.index),
                  )
                }
              >
                {slideSelection.length === slides.length ? 'Whole deck' : 'Select all slides'}
              </ScopeButton>
              {slideSelection.length ? (
                <ScopeButton type="button" onClick={() => onSlideSelection([])}>
                  Clear ({slideSelection.length})
                </ScopeButton>
              ) : null}
              {elementSelection.length ? (
                <ScopeButton type="button" onClick={() => onElementSelection([])}>
                  Clear elements ({elementSelection.length})
                </ScopeButton>
              ) : null}
              {elementSelection.length ? (
                <ScopeButton
                  type="button"
                  $danger
                  onClick={() => onDeleteElements(elementSelection.map(item => item.path))}
                >
                  Delete{' '}
                  {elementSelection.length === 1 ? 'element' : `${elementSelection.length} elements`}
                </ScopeButton>
              ) : null}
            </Scope>

            {elementSelection.length ? (
              <>
                <Picked>
                  {elementSelection.map(item => (
                    <Chip key={item.path} title={item.path}>
                      {item.label || item.path}
                    </Chip>
                  ))}
                </Picked>
                {(() => {
                  // Editing what is picked, without going through the model:
                  // retyping a line and swapping a picture are the two things
                  // nobody should have to ask for.
                  if (elementSelection.length !== 1 || !slide) return null
                  const path = elementSelection[0].path
                  const info = readElement(html, slide.index, path)
                  if (!info) return null
                  if (info.isImage || (info.editableText && !info.text)) {
                    return (
                      <Scope>
                        <Faint>
                          {info.isImage ? info.src || 'no image yet' : 'empty box'}
                        </Faint>
                        <span style={{ flex: 1 }} />
                        <ScopeButton type="button" onClick={() => onReplaceImage(path)}>
                          {info.isImage ? 'Replace image…' : 'Put an image here…'}
                        </ScopeButton>
                      </Scope>
                    )
                  }
                  if (info.editableText) {
                    return (
                      <Field>
                        <label htmlFor="element-text">
                          Text <Faint>— {info.tag}</Faint>
                        </label>
                        <textarea
                          id="element-text"
                          rows={2}
                          value={info.text}
                          onChange={event => onElementText(path, event.currentTarget.value)}
                        />
                      </Field>
                    )
                  }
                  return null
                })()}
                <Scope>
                  <Faint>Arrives on</Faint>
                  {/* Every picked element, not just the first: the panel is
                      up for the whole selection, so the buttons act on it. */}
                  <ScopeButton
                    type="button"
                    onClick={() =>
                      elementSelection.forEach(item => onSetElementStep(item.path, 0))
                    }
                  >
                    the start
                  </ScopeButton>
                  {[1, 2, 3].map(value => (
                    <ScopeButton
                      key={value}
                      type="button"
                      onClick={() =>
                        elementSelection.forEach(item =>
                          onSetElementStep(item.path, value),
                        )
                      }
                    >
                      press {value}
                    </ScopeButton>
                  ))}
                </Scope>
              </>
            ) : null}

            <Assets>
              <AssetsHead>
                <Disclosure
                  type="button"
                  disabled={!material.length}
                  aria-expanded={filesOpen && material.length > 0}
                  onClick={() => setFilesOpen(open => !open)}
                >
                  <Caret $open={filesOpen && material.length > 0}>▸</Caret>
                  <Meta>
                    {material.length
                      ? `${material.length} file${material.length === 1 ? '' : 's'}`
                      : 'No files yet'}
                  </Meta>
                </Disclosure>
                <span style={{ flex: 1 }} />
                <ScopeButton type="button" onClick={onAddFiles}>
                  Add files…
                </ScopeButton>
              </AssetsHead>
              {material.length > 0 && filesOpen ? (
                <AssetRow>
                  {material.map(item => (
                    <AssetChip
                      key={item.name}
                      type="button"
                      title={`${item.reference}${item.description ? ` — ${item.description}` : ''}`}
                      onClick={() =>
                        setRequest(current =>
                          current.includes(item.reference)
                            ? current
                            : `${current}${current.trim() ? ' ' : ''}${item.reference} `,
                        )
                      }
                    >
                      {previews[item.name] ? (
                        <AssetThumb src={previews[item.name]} alt="" />
                      ) : (
                        <AssetKind>{item.kind}</AssetKind>
                      )}
                      <AssetName>{item.name}</AssetName>
                    </AssetChip>
                  ))}
                </AssetRow>
              ) : null}
            </Assets>

            <AskBox>
              <AskInput
                value={request}
                placeholder={
                  elementSelection.length
                    ? 'Make it two lines, and bring it in on the second press…'
                    : slideSelection.length > 1
                      ? 'Warm the palette across the deck, and tighten every headline…'
                      : 'Split this into three points that build one at a time…'
                }
                spellCheck={false}
                onChange={event => setRequest(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    submitAsk()
                  }
                }}
              />
              <AskBoxFoot>
                <Hint>{asking ? 'Working…' : scopeHint}</Hint>
                <span style={{ flex: 1 }} />
                <Kbd>⌘⏎</Kbd>
                <SendButton
                  type="button"
                  aria-label="Send"
                  disabled={!request.trim() || asking}
                  onClick={submitAsk}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4z" />
                  </svg>
                </SendButton>
              </AskBoxFoot>
            </AskBox>
          </AskBlock>
        </Rail>
      ) : null}
    </Root>
  )
}

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'data-chrome': kind,
  ...extra,
})

/** The stage fills the frame; the rail is the platform's right sidebar. */
const Root = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
`

const Stage = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
`

/** The one format bar above the board — platform toolbar, 36 tall. */
const Toolbar = styled.div.attrs(chrome('toolbar'))`
  gap: 6px;
`

const StageHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Tabs = styled.div`
  display: flex;
  gap: 2px;
`

const TabButton = styled.button.attrs(chrome('toolbar-control'))``

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
`

/** Down, not across: a deck is a stack. The strip is the app's left sidebar. */
const Strip = styled.div.attrs(chrome('sidebar'))`
  grid-row: 1 / -1;
  gap: 12px;
  padding: 12px var(--pure-chrome-inset);
`

const PickerScrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const PickerBox = styled.div`
  width: min(720px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.28);
`

const PickerHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
`

const PickerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
`

const PickerCard = styled.button`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
`

const PickerName = styled.span`
  font-size: var(--pure-chrome-ui-size);
  font-weight: 600;
`

const PickerNote = styled.span`
  font-size: 12px;
  line-height: 1.35;
  color: var(--pure-chrome-soft);
`

const PickerSteps = styled.span.attrs(chrome('meta'))`
  && {
    color: ${ACCENT};
  }
`

const CardSlot = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

/** Where the slide will land — drawn in the gap, not on a card. */
const DropLine = styled.div`
  height: 3px;
  border-radius: 0;
  background: ${ACCENT};
`

const Card = styled.button<{ $selected?: boolean; $dragging?: boolean }>`
  position: relative;
  flex: none;
  opacity: ${props => (props.$dragging ? 0.4 : 1)};
  cursor: ${props => (props.$dragging ? 'grabbing' : 'pointer')};
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
`

const CardFrame = styled.span<{ $selected?: boolean }>`
  position: relative;
  display: block;
  border-radius: 0;
  overflow: hidden;
  outline: ${props =>
    props.$selected ? `2px solid ${ACCENT}` : '1px solid var(--pure-chrome-line)'};
  outline-offset: ${props => (props.$selected ? '1px' : '0')};
`

/* The badge, tick and marks sit ON the slide picture, so they stay light over it in both modes. */
const CardBadge = styled.span<{ $selected?: boolean }>`
  position: absolute;
  top: 5px;
  left: 5px;
  border-radius: 0;
  padding: 1px 6px;
  font-family: var(--platform-typography-font-family-mono);
  font-size: 9px;
  background: ${props => (props.$selected ? ACCENT : 'rgb(255 255 255 / 0.92)')};
  color: ${props => (props.$selected ? 'var(--pure-chrome-on-accent)' : '#17171d')};
`

const CardTick = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 5px;
  right: 5px;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border: 1px solid
    ${props => (props.$on ? ACCENT : 'var(--pure-chrome-line)')};
  border-radius: 0;
  background: ${props => (props.$on ? ACCENT : 'rgb(255 255 255 / 0.88)')};
  color: var(--pure-chrome-on-accent);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
`

const CardMarks = styled.span`
  position: absolute;
  bottom: 5px;
  right: 5px;
  display: flex;
  gap: 4px;
  color: #17171d;
`

const Mark = styled.span`
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 0.86);
  border-radius: 0;
  padding: 1px;
`

const CardLabel = styled.span<{ $selected?: boolean }>`
  font-size: var(--pure-chrome-ui-size);
  line-height: 1.3;
  color: ${props => (props.$selected ? 'var(--platform-colors-text)' : 'var(--pure-chrome-soft)')};
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`

const AddCard = styled.button`
  flex: none;
  border: 1px dashed var(--pure-chrome-line);
  border-radius: 0;
  background: none;
  padding: 9px;
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  color: var(--pure-chrome-soft);
  cursor: pointer;
`

const Selected = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 20px 20px 0;
`

const SelectedStage = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  border-radius: 0;
  background: var(--pure-chrome-well);
  padding: 20px;
`

const Transport = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
`

const TransportButton = styled.button`
  width: var(--pure-chrome-control-height);
  height: var(--pure-chrome-control-height);
  border: 1px solid var(--pure-chrome-line);
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

const StepButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--pure-chrome-control-height);
  padding: 0 11px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const Dots = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`

const Dot = styled.span<{ $on: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  cursor: pointer;
  background: ${props => (props.$on ? ACCENT : 'transparent')};
  border: 1px solid ${props => (props.$on ? ACCENT : 'var(--pure-chrome-line)')};
`

const PickToggle = styled.button<{ $on: boolean }>`
  height: var(--pure-chrome-control-height);
  padding: 0 10px;
  border: 1px solid
    ${props => (props.$on ? ACCENT : 'var(--pure-chrome-line)')};
  border-radius: 7px;
  background: ${props => (props.$on ? ACCENT : 'var(--pure-chrome-surface)')};
  color: ${props => (props.$on ? 'var(--pure-chrome-on-accent)' : 'var(--pure-chrome-soft)')};
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
`

const AssetsPane = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const Foot = styled.div`
  grid-column: 2;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 10px 20px 16px;
`

/** Bottom-left, always mono: the app's one line of running commentary. */
const StatusLine = styled.div.attrs(chrome('meta'))`
  white-space: normal;
`

/** The one verb the status line offers: Undo, or Retry. */
const StatusButton = styled.button`
  margin-left: 10px;
  padding: 1px 8px;
  border: 1px solid ${ACCENT};
  border-radius: 0;
  background: none;
  color: ${ACCENT};
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-meta-size);
  cursor: pointer;
`

/**
 * The deck's verification, in people words: checked, being checked, or
 * which slides have overlapping text. Clicking measures every slide again.
 */
const VerifyBadge = styled.button.attrs(chrome('toolbar-select'))<{
  $state: 'verified' | 'checking' | 'failed'
}>`
  && {
    border-color: ${props =>
      props.$state === 'failed' ? 'var(--platform-colors-danger)' : 'var(--pure-chrome-line)'};
    border-style: ${props => (props.$state === 'checking' ? 'dashed' : 'solid')};
    color: ${props =>
      props.$state === 'failed' ? 'var(--platform-colors-danger)' : 'var(--pure-chrome-soft)'};
    cursor: pointer;
    white-space: nowrap;
  }
`

/** The slide's inspector: the platform's right sidebar. */
const Rail = styled.aside.attrs(chrome('sidebar', { 'data-side': 'right' }))`
  gap: 12px;
  padding: 12px var(--pure-chrome-inset) 16px;
`

const SectionHead = styled.div.attrs(chrome('section-label'))`
  && {
    padding: 0;
  }
`

/**
 * A slide whose content collides is broken in a way the viewer cannot repair,
 * so it is said plainly rather than left to be noticed on the projector.
 */
const Warn = styled.span`
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-meta-size);
  padding: 2px 7px;
  margin-left: 10px;
  border-radius: 0;
  color: var(--platform-colors-danger);
  background: var(--platform-colors-danger-surface, rgb(180 52 14 / 0.1));
`

const CardWarn = styled.span`
  position: absolute;
  top: 6px;
  right: 26px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--platform-colors-danger);
`

const Meta = styled.div.attrs(chrome('meta'))``

const Faint = styled.span.attrs(chrome('meta'))`
  white-space: normal;
`

const Ops = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
`

const OpButton = styled.button<{ $danger?: boolean }>`
  height: var(--pure-chrome-control-height);
  padding: 0;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: ${props => (props.$danger ? 'var(--platform-colors-danger)' : 'var(--platform-colors-text)')};
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

/** A label over a platform field; the textarea keeps its height but reads the same tokens. */
const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  label {
    color: var(--pure-chrome-soft);
  }
  input {
    width: 100%;
  }
  textarea {
    padding: 8px 10px;
    border: 1px solid var(--pure-chrome-line);
    border-radius: var(--pure-chrome-radius);
    background: var(--pure-chrome-surface);
    color: var(--platform-colors-text);
    font: inherit;
    font-size: 12px;
    resize: vertical;
  }
`

const AskBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--pure-chrome-line);
  padding-top: 10px;
`

const Scope = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`

const ScopeButton = styled.button<{ $on?: boolean; $danger?: boolean }>`
  height: var(--pure-chrome-control-height);
  padding: 0 9px;
  border: 1px solid
    ${props =>
      props.$danger
        ? 'var(--platform-colors-danger)'
        : props.$on
          ? ACCENT
          : 'var(--pure-chrome-line)'};
  border-radius: 7px;
  background: var(--pure-chrome-surface);
  color: ${props =>
    props.$danger
      ? 'var(--platform-colors-danger)'
      : props.$on
        ? ACCENT
        : 'var(--pure-chrome-soft)'};
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const Picked = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`

const Chip = styled.span`
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid ${ACCENT};
  border-radius: 999px;
  color: ${ACCENT};
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Assets = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--pure-chrome-line);
`

const AssetsHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

/**
 * The file list is a drawer, not a shelf.
 *
 * Attachments are consulted while writing a prompt and ignored the rest of
 * the time, so the rail shows the count and keeps the thumbnails folded away
 * until asked. With nothing attached there is nothing to open.
 */
const Disclosure = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
`

const Caret = styled.span<{ $open: boolean }>`
  font-size: 9px;
  line-height: 1;
  color: var(--pure-chrome-muted);
  transform: rotate(${props => (props.$open ? '90deg' : '0deg')});
  transition: transform 120ms ease;

  ${Disclosure}:disabled & {
    opacity: 0;
  }
`

const AssetRow = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
`

const AssetChip = styled.button`
  flex: none;
  width: 66px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
`

const AssetThumb = styled.img`
  width: 66px;
  height: 40px;
  object-fit: contain;
  display: block;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const AssetKind = styled.span`
  width: 66px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 0;
  background: var(--pure-chrome-surface);
  font-family: var(--platform-typography-font-family-mono);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--pure-chrome-muted);
`

const AssetName = styled.span.attrs(chrome('meta'))`
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
`

/** One box: the request and its send controls are a single object. */
const AskBox = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
`

const AskInput = styled.textarea`
  min-height: 40px;
  resize: vertical;
  padding: 9px 11px 4px;
  border: 0;
  background: transparent;
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
`

const AskBoxFoot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 8px 11px;
`

const Kbd = styled.kbd`
  font-family: var(--platform-typography-font-family-mono);
  font-size: 10px;
  color: var(--pure-chrome-muted);
  border: 1px solid var(--pure-chrome-line);
  padding: 2px 5px;
`

const SendButton = styled.button`
  flex: none;
  width: var(--pure-chrome-control-height);
  height: var(--pure-chrome-control-height);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: ${ACCENT};
  color: var(--pure-chrome-on-accent);
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const Hint = styled.div.attrs(chrome('meta'))`
  white-space: normal;
`

const Mono = styled.span.attrs(chrome('meta'))``

const HtmlButton = styled.button.attrs(chrome('toolbar-control'))``

const PresentButton = styled.button.attrs(chrome('toolbar-select'))`
  cursor: pointer;
`

/** The toolbar's one primary control: the accent's third and last appearance. */
const ExportButton = styled.button`
  height: var(--pure-chrome-control-height);
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  background: var(--pure-chrome-accent);
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
`

const PrimaryButton = styled.button`
  height: var(--pure-chrome-control-height);
  padding: 0 18px;
  border: 0;
  border-radius: 7px;
  background: var(--pure-chrome-accent);
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const Empty = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 40px;
`

const EmptyTitle = styled.div`
  font-size: 17px;
  font-weight: 600;
`

const EmptyBody = styled.div`
  font-size: var(--pure-chrome-ui-size);
  color: var(--pure-chrome-soft);
  max-width: 44ch;
`
