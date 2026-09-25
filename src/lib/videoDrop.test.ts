// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { insertVideoEmbed } from './slides'
import { imageTransferMarkup, readImageTransfer } from '@purescience/platform-ui/bridge/imageTransfer'
if ('happyDOM' in window)
  (window as any).happyDOM.settings.disableIframePageLoading = true
it('inserts an actual image at the drop position on the selected slide', () => {
  const image = readImageTransfer(JSON.stringify({ version: 1, name: 'test.png', alt: 'ImageMaker', dataUrl: 'data:image/png;base64,YQ==' }))
  const html = '<html><body><main id="deck"><section class="slide" data-slide>One</section><section class="slide" data-slide>Two</section></main></body></html>'
  const doc = new DOMParser().parseFromString(insertVideoEmbed(html, 1, imageTransferMarkup(image), { x: .2, y: .1 }), 'text/html')
  expect(doc.querySelectorAll('.slide')[0].querySelector('img')).toBeNull()
  expect(doc.querySelector('img')?.src).toBe(image.dataUrl)
  expect(doc.querySelector('img')?.style.left).toBe('20%')
  expect(doc.querySelector('img')?.style.height).toBe('50%')
  expect(doc.querySelector('img')?.style.objectFit).toBe('contain')
})
it('places an embed on the selected slide without changing another slide', () => {
  const html =
    '<html><body><main id="deck"><section class="slide" data-slide><h1>One</h1></section><section class="slide" data-slide><h1>Two</h1></section></main></body></html>'
  const next = new DOMParser().parseFromString(
    insertVideoEmbed(
      html,
      1,
      '<figure data-video-source="https://youtube.com/watch?v=M7lc1UVf-VE"><iframe src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"></iframe></figure>',
      { x: 0.25, y: 0.1 },
    ),
    'text/html',
  )
  expect(next.querySelectorAll('.slide')[0].querySelector('iframe')).toBeNull()
  const video = next.querySelector('figure')!
  expect(video.getAttribute('style')).toContain('left: 25%')
  expect(video.getAttribute('style')).toContain('top: 10%')
  expect(next.querySelectorAll('h1').length).toBe(2)
})
