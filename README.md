<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pureslides4 icon"></p>

# PureSlides4

## App documentation

Author HTML slide decks, present them, and export the result.

1. Create or open a `.deck` and edit the slide markup.
2. Use the board and presentation views to check layout, slide order, and builds.
3. Save the editable deck and use export controls for PDF, images, or video. Export availability depends on the host environment.

Read the [app guide](docs/app-guide.md) for usage and development requirements. This app runs within [puredesktop](https://puredesktop.ai).

## Open source and contributions

Create, present, and export HTML slide decks.

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS) | [Homepage / docs](https://gitbrent.github.io/PptxGenJS/) | — |
| [Vanilagy/mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | [Successor: Mediabunny](https://mediabunny.dev/) | [Ko-fi](https://ko-fi.com/vanilagy) |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


A slide deck is an HTML document you can present.

Built on PureVideo's shape: the board IS the markup, every operation is an
HTML transform, and every control a person uses has a tool beside it that the
drawer agent calls to change the same state. What differs is the paradigm —
the strip runs down rather than across, because a deck is a stack rather than
a timeline, and slides advance on a key press rather than a clock.

- **Slides** — a vertical board; the stage shows a real slide, not a picture
  of one.
- **Builds** — `data-step="N"` on any element makes it arrive on the Nth
  press. Seekable, so the same model drives the board, presenting, the PDF
  and the video.
- **Present** — full screen with keys (`← →` step then slide, `B` black, `S`
  presenter view, number + Enter to jump), optional on-screen arrows.
- **Export** — PDF (one page per slide), images, or video.

Port 5440 · slug `slides` · packages are `.deck` folders.
