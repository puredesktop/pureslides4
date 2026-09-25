#!/usr/bin/env node
/**
 * Preview ↔ PDF parity harness for the deck's print path.
 *
 * Builds a six-slide deck (builds on every slide, a web font, a pinned
 * footer, an overflowing slide the fit has to scale), then in a real
 * Chromium — Electron's, the same engine the shell prints with —
 *
 *   1. renders each slide the way the board does (`shownSlideHtml` at its
 *      last step) and reads the slide's visible text and its fitted box;
 *   2. prints `printableHtml` of the same deck to PDF with the shell's own
 *      options (preferCSSPageSize, zero margins, print background);
 *   3. checks with pdfjs that sheets == slides and, per sheet, that the text
 *      is the text the preview showed — nothing lost, nothing added, nothing
 *      moved between sheets — and that no slide's images were dropped.
 *
 * Usage:
 *   node scripts/print-parity.mjs [--out dir] [--keep]
 *
 * Requires electron and pdfjs-dist resolvable from the monorepo root, and
 * the app's TypeScript sources (they are bundled with esbuild on the fly).
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const OUT = flag('--out', path.join(root, '.parity'))
const KEEP = args.includes('--keep')

// ---- the deck ---------------------------------------------------------------

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&display=swap" />'

function slide(index, body, extra = '') {
  return `<div data-slide data-block="s${index}" style="position:absolute;inset:0;padding:64px;background:#fff;color:#1b1b1e;display:flex;flex-direction:column;gap:18px;font-family:Archivo,system-ui,sans-serif"${extra}>${body}</div>`
}

// A raster image (an SVG prints as vector drawing, not as an image object):
// a 4×2 PNG, hand-built so the harness needs no encoder.
function png(width, height, rgba) {
  const zlib = require('node:zlib')
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = buf => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const rows = []
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]))
    rows.push(Buffer.from(rgba.slice(y * width * 4, (y + 1) * width * 4)))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const IMG = `data:image/png;base64,${png(
  4,
  2,
  [
    ...[201, 164, 74, 255], ...[27, 27, 30, 255], ...[201, 164, 74, 255], ...[27, 27, 30, 255],
    ...[27, 27, 30, 255], ...[201, 164, 74, 255], ...[27, 27, 30, 255], ...[201, 164, 74, 255],
  ],
).toString('base64')}`

const DECK = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Parity</title>
${FONT_LINK}
<style>
  html, body { margin: 0; padding: 0; background: #0e0e11; }
  [data-slide] { box-sizing: border-box; }
  [data-step] { transition: opacity 260ms ease, transform 260ms ease; }
  [data-step].pv-out { opacity: 0; transform: translateY(10px); visibility: hidden; }
  [data-step].pv-in { opacity: 1; transform: none; visibility: visible; }
  h1 { margin: 0; font-size: 56px; font-weight: 800; letter-spacing: -0.02em; }
  p, li { margin: 0; font-size: 26px; line-height: 1.4; }
  .foot { position: absolute; left: 64px; right: 64px; bottom: 48px; font-size: 18px; color: #6d6f73; }
</style>
</head>
<body>
<div id="deck" data-deck-id="deck" data-width="1280" data-height="720" style="width: 1280px; height: 720px; position: relative; overflow: hidden">
${slide(1, '<h1>Parity, slide one</h1><p>The PDF is the board, printed.</p><div class="foot">Footer one</div>')}
${slide(2, '<h1>Builds reveal on paper</h1><ul><li data-step="1">First press arrives</li><li data-step="2">Second press arrives</li><li data-step="3">Third press arrives</li></ul>')}
${slide(3, '<h1>An image and a caption</h1><img src="' + IMG + '" alt="" style="width:400px;height:200px" /><p data-step="1">Caption arrives on the first press</p>')}
${slide(4, '<h1>Too much for one slide</h1>' + Array.from({ length: 14 }, (_, i) => `<p>Line ${i + 1} of a paragraph that will not fit, so the slide is scaled.</p>`).join('') + '<div class="foot">Footer four</div>')}
${slide(5, '<h1>Two columns</h1><div style="display:flex;gap:32px"><div style="flex:1"><p>Left column copy about a matter.</p></div><div style="flex:1"><p data-step="1">Right column copy arrives later.</p></div></div>')}
${slide(6, '<h1>The end</h1><p>Questions welcome.</p><p data-step="1">Thank you.</p><div data-notes hidden style="display:none">Hidden speaker notes must not print</div>')}
</div>
</body>
</html>
`

// ---- bundle the app's lib for the harness ---------------------------------

async function bundleLib() {
  const esbuild = require(require.resolve('esbuild', { paths: [path.join(root, '..', '..')] }))
  const entry = path.join(OUT, 'entry.ts')
  await fs.writeFile(
    entry,
    `import { printableHtml } from '${path.join(root, 'src/lib/exportDeck.ts')}'
import { shownSlideHtml } from '${path.join(root, 'src/lib/slideSeek.ts')}'
import { slidesFromHtml } from '${path.join(root, 'src/lib/slides.ts')}'
export { printableHtml, shownSlideHtml, slidesFromHtml }
`,
  )
  // A browser bundle: the lib parses html with DOMParser, which only a
  // renderer has — the harness page loads it and answers the main process.
  const outfile = path.join(OUT, 'lib.js')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: '__ps4',
    outfile,
    logLevel: 'silent',
    // The bridge is never called by these three; stub the module so the
    // bundle does not pull the platform client in.
    plugins: [
      {
        name: 'stub-bridge',
        setup(build) {
          build.onResolve({ filter: /platformBridge$/ }, () => ({ path: 'bridge-stub', namespace: 'stub' }))
          build.onResolve({ filter: /^@purescience\/platform-ui\/bridge/ }, () => ({ path: 'bridge-stub', namespace: 'stub' }))
          build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'module.exports = new Proxy({}, { get: () => () => { throw new Error("bridge not available in the parity harness") } })',
            loader: 'js',
          }))
        },
      },
    ],
    alias: {
      '@purescience/platform-ui/editing': path.join(root, '..', '..', 'packages/ui/src/editing/index.ts'),
    },
  })
  return outfile
}

// ---- the electron side -----------------------------------------------------

const MAIN = (libPath, deckPath) => `
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const OUT = ${JSON.stringify(OUT)}
const deck = fs.readFileSync(${JSON.stringify(deckPath)}, 'utf8')
app.commandLine.appendSwitch('disable-gpu')
// A watchdog: a hung load must not hang the harness.
setTimeout(() => { console.error('parity: electron side timed out'); app.exit(2) }, 90000)

// Text the way pdfjs will see it: what is visible in the shown slide.
const READ_SLIDE = \`(() => {
  const root = document.querySelector('[data-deck-id]');
  const kids = [...root.children].filter(c => c.hasAttribute('data-slide'));
  const el = kids.find(c => getComputedStyle(c).display !== 'none') || root;
  const rect = el.getBoundingClientRect();
  const imgs = [...el.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] });
  return { text: el.innerText, overlaps: el.getAttribute('data-pv-overlaps') || '0', box: [Math.round(rect.width), Math.round(rect.height)], transform: el.style.transform || '', imgs, fonts: document.fonts.status };
})()\`

async function settle(win) {
  await win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true', true)
  await new Promise(r => setTimeout(r, 400))
}

async function main() {
  await app.whenReady()
  fs.mkdirSync(OUT, { recursive: true })
  // One window for everything, loaded page after page: the app's own lib
  // first (it parses html with DOMParser, which only a renderer has), then
  // each preview, then the print document.
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } })
  await win.loadFile(path.join(OUT, 'harness.html'))
  const built = await win.webContents.executeJavaScript(\`(() => {
    const deck = \${JSON.stringify(deck)};
    const slides = __ps4.slidesFromHtml(deck);
    return {
      slides,
      previews: slides.map(s => __ps4.shownSlideHtml(deck, s.index, s.steps)),
      print: __ps4.printableHtml(deck, { notes: slides.map(s => s.notes) }),
    };
  })()\`, true)
  const slides = built.slides
  const preview = []
  for (const slide of slides) {
    const htmlPath = path.join(OUT, 'preview-' + slide.index + '.html')
    fs.writeFileSync(htmlPath, built.previews[slide.index])
    await win.loadFile(htmlPath)
    await settle(win)
    // Fit again with fonts loaded, as the board's frame does on fonts.ready.
    await win.webContents.executeJavaScript('window.__slideShow(' + slide.index + ',' + slide.steps + '); true', true)
    await new Promise(r => setTimeout(r, 100))
    preview.push(await win.webContents.executeJavaScript(READ_SLIDE, true))
  }
  const printPath = path.join(OUT, 'print.html')
  // PARITY_EXTRA_CSS: extra print-only css appended to the scaffold's own
  // style, for trying a rule against the harness before adopting it.
  const extra = process.env.PARITY_EXTRA_CSS || ''
  const at = built.print.lastIndexOf('</style>')
  const printDoc = extra && at >= 0 ? built.print.slice(0, at) + extra + built.print.slice(at) : built.print
  fs.writeFileSync(printPath, printDoc)
  const pw = win
  await pw.loadFile(printPath)
  await settle(pw)
  const printState = await pw.webContents.executeJavaScript(\`(() => {
    const pages = [...document.querySelectorAll('.pv-page[data-slide-index]')];
    return {
      faults: document.documentElement.getAttribute('data-pv-print-faults'),
      measured: document.documentElement.getAttribute('data-pv-print-measured'),
      fonts: document.documentElement.getAttribute('data-pv-print-fonts'),
      fingerprint: document.documentElement.getAttribute('data-print-fingerprint'),
      pages: pages.map(p => {
        const root = p.querySelector('[data-deck-id]');
        const kids = [...root.children].filter(c => c.hasAttribute('data-slide'));
        const el = kids[Number(p.getAttribute('data-slide-index'))];
        const rect = el.getBoundingClientRect();
        const imgs = [...el.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] });
        return { text: el.innerText, box: [Math.round(rect.width), Math.round(rect.height)], transform: el.style.transform || '', imgs };
      })
    }
  })()\`, true)
  const pdf = await pw.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  const pdfPath = path.join(OUT, 'deck.pdf')
  fs.writeFileSync(pdfPath, pdf)
  pw.destroy()
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ preview, print: printState, pdf: pdfPath, slides: slides.length }, null, 2))
  app.exit(0)
}
main().catch(e => { console.error(e); app.exit(1) })
`

// ---- the node side ----------------------------------------------------------

// Text is compared as a bag of letters: pdfjs reads in paint order and
// may split or join runs differently from innerText, none of which moves
// text between sheets — the invariant.
function normalize(text) {
  return [...String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')].sort().join('')
}

async function pdfPages(pdfPath) {
  const pdfjs = await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs', { paths: [path.join(root, '..', '..')] }))
  const data = new Uint8Array(await fs.readFile(pdfPath))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const ops = await page.getOperatorList()
    const images = ops.fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length
    const view = page.getViewport({ scale: 1 })
    pages.push({
      text: content.items.map(item => item.str ?? '').join(' '),
      images,
      size: [Math.round(view.width), Math.round(view.height)],
    })
  }
  return pages
}

async function main() {
  await fs.mkdir(OUT, { recursive: true })
  const deckPath = path.join(OUT, 'deck.html')
  await fs.writeFile(deckPath, DECK)
  const libPath = await bundleLib()
  await fs.writeFile(
    path.join(OUT, 'harness.html'),
    `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="lib.js"></script></head><body></body></html>`,
  )
  const mainPath = path.join(OUT, 'electron-main.cjs')
  await fs.writeFile(mainPath, MAIN(libPath, deckPath))
  await fs.writeFile(path.join(OUT, 'package.json'), JSON.stringify({ name: 'ps4-parity', main: 'electron-main.cjs' }))
  const electron = require(require.resolve('electron', { paths: [path.join(root, '..', '..')] }))
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [OUT], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 120000)
    child.on('exit', code => {
      clearTimeout(watchdog)
      code === 0 ? resolve() : reject(new Error(`electron exited ${code}`))
    })
  })
  const report = JSON.parse(await fs.readFile(path.join(OUT, 'report.json'), 'utf8'))
  const pages = await pdfPages(report.pdf)
  const failures = []
  if (pages.length !== report.slides) failures.push(`PDF sheets ${pages.length} != slides ${report.slides}`)
  if (report.print.measured !== '1') failures.push('print document measured dead')
  if (report.print.fonts !== 'loaded') failures.push(`print fonts ${report.print.fonts}`)
  const rows = []
  for (let i = 0; i < report.slides; i += 1) {
    const pv = report.preview[i]
    const pr = report.print.pages[i]
    const pdf = pages[i]
    const row = { slide: i + 1, ok: true, notes: [] }
    if (pv.fonts !== 'loaded') row.notes.push(`preview fonts ${pv.fonts}`)
    if (!pr) {
      row.ok = false
      row.notes.push('no print page')
    } else {
      if (normalize(pv.text) !== normalize(pr.text)) {
        row.ok = false
        row.notes.push(`print DOM text differs: ${normalize(pv.text).length} vs ${normalize(pr.text).length} letters`)
      }
      if (pv.box.join('x') !== pr.box.join('x') || pv.transform !== pr.transform) {
        row.ok = false
        row.notes.push(`fit differs: preview ${pv.box.join('x')} ${pv.transform || 'unscaled'} vs print ${pr.box.join('x')} ${pr.transform || 'unscaled'}`)
      }
      if (JSON.stringify(pv.imgs) !== JSON.stringify(pr.imgs)) {
        row.ok = false
        row.notes.push(`image boxes differ: ${JSON.stringify(pv.imgs)} vs ${JSON.stringify(pr.imgs)}`)
      }
    }
    if (!pdf) {
      row.ok = false
      row.notes.push('no PDF sheet')
    } else {
      if (normalize(pv.text) !== normalize(pdf.text)) {
        row.ok = false
        row.notes.push(`PDF text differs: ${normalize(pv.text).length} letters on screen vs ${normalize(pdf.text).length} in the PDF`)
      }
      if (pdf.images !== pv.imgs.length) {
        row.ok = false
        row.notes.push(`PDF paints ${pdf.images} images, preview shows ${pv.imgs.length}`)
      }
      // A 1280×720 CSS px page box is 960×540 pt on paper.
      if (pdf.size.join('x') !== '960x540') {
        row.ok = false
        row.notes.push(`sheet is ${pdf.size.join('x')}pt, not the 960x540pt (1280x720px) page box`)
      }
    }
    if (pv.overlaps !== '0') row.notes.push(`preview reports ${pv.overlaps} overlap(s)`)
    if (!row.ok) failures.push(`slide ${i + 1}`)
    rows.push(row)
  }
  console.log(`\nprint fingerprint ${report.print.fingerprint}`)
  console.log(`sheets ${pages.length} / slides ${report.slides} · print faults ${report.print.faults} · fonts ${report.print.fonts}\n`)
  console.log('slide  ok  preview box        scaled  notes')
  for (let i = 0; i < rows.length; i += 1) {
    const pv = report.preview[i]
    console.log(
      `${String(rows[i].slide).padStart(5)}  ${rows[i].ok ? 'ok' : 'XX'}  ${pv.box.join('x').padEnd(17)} ${pv.transform ? 'yes   ' : 'no    '} ${rows[i].notes.join('; ')}`,
    )
  }
  console.log(`\n${rows.filter(r => r.ok).length}/${rows.length} slides match their sheet (text, fit, images).`)
  if (failures.length) console.log(`failures: ${failures.join(', ')}`)
  if (!KEEP) {
    for (const name of await fs.readdir(OUT)) {
      if (!/\.(pdf|json)$/.test(name)) await fs.rm(path.join(OUT, name), { force: true })
    }
  }
  process.exit(failures.length ? 1 : 0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
