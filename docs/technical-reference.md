# pureslides technical reference

[Back to the README](../README.md) · [Development guide](development.md)

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
