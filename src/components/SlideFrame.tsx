import { EmbeddedVideoPreview, prepareEmbeddedVideoPreview, restoreEmbeddedVideoPreview } from '@purescience/platform-ui/components/assets/EmbeddedVideoPreview'
/**
 * One slide, shown.
 *
 * Every place a slide appears — a card in the strip, the stage, the presenting
 * window — is this component at a different size, reading the same document
 * through the same seek. A card cannot show something presenting will not.
 *
 * The document is loaded ONCE and driven by message thereafter: rebuilding
 * the srcDoc per step reloads the page, which cannot animate a build and
 * restarts anything the slide is playing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { shownSlideHtml } from '../lib/slideSeek'
import { layoutReportFrom, type LayoutReport } from '../lib/deckVerification'
import { deinlineAssetUrls, inlineAssetUrls, picturesOnly, type PreviewAssetMap } from '../lib/packageAssets'
import type { DeckGeometry } from '../types'

const NO_PREVIEWS: PreviewAssetMap = {}

export function SlideFrame({
  html,
  slide,
  step,
  geometry,
  width,
  picking = false,
  highlight = [],
  previews = NO_PREVIEWS,
  live = false,
  dropTarget = false,
  onPick,
  onEdit,
  onLayout,
}: {
  html: string
  slide: number
  step: number
  geometry: DeckGeometry
  width: number
  picking?: boolean
  highlight?: string[]
  /**
   * Package assets as data URLs, by file name. The frame is a sandboxed
   * srcDoc with no origin, so `assets/<name>` resolves nowhere; the frame
   * shows the file by inlining it, view-time only — what it hands back is
   * mapped to the package path again.
   */
  previews?: PreviewAssetMap
  /**
   * A live surface plays the slide's video when the slide comes up: the
   * stage and presenting. A card, a measurement, a print show its first
   * frame.
   */
  live?: boolean
  dropTarget?: boolean
  onPick?: (path: string, label: string, additive: boolean, slide: number) => void
  /**
   * Typing in the slide itself: the edited element arrives serialized, with
   * the html this frame was showing — the version the edit was typed into.
   */
  onEdit?: (slide: number, path: string, outerHtml: string, html: string) => void
  /**
   * What this frame measured after rendering: overlaps the fit could not
   * separate (a fault in the slide, not the view), whether the frame had
   * geometry at all, and the fonts it measured under — with the html it
   * rendered, so the report is pinned to a version of the deck.
   */
  onLayout?: (slide: number, report: LayoutReport, html: string) => void
}): React.ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(0)
  const scale = width / geometry.width
  // A frame that does not play a clip does not carry its bytes.
  const shown = useMemo(() => (live ? previews : picturesOnly(previews)), [previews, live])
  const doc = useMemo(
    () => prepareEmbeddedVideoPreview(shownSlideHtml(inlineAssetUrls(html, shown), slide, step)),
    [html, shown],
  )
  const highlightKey = highlight.join('|')

  const post = useCallback((message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as
        | {
            type?: string
            path?: string
            label?: string
            additive?: boolean
            slideIndex?: number
            slide?: number
            overlaps?: unknown
            measured?: unknown
            fonts?: unknown
            fontsSignature?: unknown
          }
        | undefined
      if (data?.type === 'pureslides:ready') setReady(count => count + 1)
      if (data?.type === 'pureslides:layout') {
        onLayout?.(data.slide ?? 0, layoutReportFrom(data), html)
      }
      if (data?.type === 'pureslides:picked' && typeof data.path === 'string') {
        onPick?.(data.path, data.label ?? '', !!data.additive, data.slideIndex ?? 0)
      }
      if (
        data?.type === 'pureslides:edited' &&
        typeof data.path === 'string' &&
        typeof (data as { outerHtml?: unknown }).outerHtml === 'string'
      ) {
        // Typed into the inlined DOM: the package paths go back in before
        // the edit lands, or it would commit base64 into the document.
        onEdit?.(
          data.slideIndex ?? 0,
          data.path,
          restoreEmbeddedVideoPreview(deinlineAssetUrls((data as { outerHtml: string }).outerHtml, shown).html),
          html,
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onPick, onEdit, onLayout, html, shown])

  // `ready` is in every dep list: a frame that has just loaded has not seen
  // anything sent before it existed.
  useEffect(() => {
    post({ type: 'pureslides:show', slide, step, live })
  }, [post, slide, step, live, ready])
  useEffect(() => {
    post({ type: 'pureslides:picking', on: picking })
  }, [post, picking, ready])
  useEffect(() => {
    post({
      type: 'pureslides:highlight',
      paths: highlightKey ? highlightKey.split('|') : [],
      slide,
      scale,
    })
  }, [post, highlightKey, slide, scale, ready])

  return (
    <Box data-video-drop-surface={dropTarget || undefined} style={{ width, height: geometry.height * scale }}>
      <Scene
        ref={frameRef}
        $interactive={picking || live}
        sandbox="allow-scripts allow-presentation"
        allow="fullscreen; encrypted-media; picture-in-picture"
        srcDoc={doc}
        tabIndex={-1}
        title="Slide"
        style={{
          width: geometry.width,
          height: geometry.height,
          transform: `scale(${scale})`,
        }}
      />
      <EmbeddedVideoPreview frame={frameRef} scale={scale} documentKey={doc} interactive={live && !picking} />
    </Box>
  )
}

const Box = styled.span`
  position: relative;
  display: block;
  overflow: hidden;
  background: #ffffff;
  /* A white slide on a light board has no edges of its own. */
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 0.16),
    0 4px 14px rgb(18 18 22 / 0.1);
`

/**
 * The frame swallows no clicks unless it is being picked from: a card sits
 * inside a button and must not eat the click that selects it.
 */
const Scene = styled.iframe<{ $interactive?: boolean }>`
  position: absolute;
  inset: 0;
  border: 0;
  transform-origin: top left;
  pointer-events: ${props => (props.$interactive ? 'auto' : 'none')};
`
