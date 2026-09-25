# PureSlides4

## Open source and contributions

Create, present, and export HTML slide decks.

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

- [pptxgenjs](https://github.com/gitbrent/PptxGenJS).
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer).
- [react](https://github.com/react/react).
- [react-dom](https://github.com/react/react).
- [styled-components](https://github.com/styled-components/styled-components).

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Snapshot and development context

Based on a cleaned snapshot from [Nikau-Dev/pureslides4](https://github.com/Nikau-Dev/pureslides4) at
commit `2503482e46bd113bd2fc881e02f84e4581d60dec` (main branch snapshot, 2026-09-25).
This repository begins with one clean initial commit; previous Git history was not copied.
Bundled demo datasets, saved development records, and identifying personal examples were removed or anonymized.

This is a PureDesktop app source repository. Local `@purescience/platform-*`
dependencies refer to shared packages in the parent suite and are not included here.
Use the matching PureDesktop development environment and the app's existing scripts;
this snapshot alone is not a complete standalone desktop application.


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
