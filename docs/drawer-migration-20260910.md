# Slides: drawer migration — 2026-09-10

The app now saves explicit drawer requests instead of running a private model call. UI actions dispatch into a document-associated drawer session; preparation tools return immediately to the current runner. The app owns scoped writes, persistence, history, validation and export. There are no shell changes in this migration.

Requests persist identity, package path, revision, selection and image byte hashes. Commit rejects stale documents, replaced images, cancelled requests and out-of-scope edits. Repeated committed requests return their saved receipt. Image descriptions use actual UI image attachments and protect manual description/role changes. Save completion is separate from layout/build/render verification. Stopping the drawer leaves the saved request resumable; cancelDrawerRequest explicitly abandons it.

Live testing found and fixed a package-rename receipt problem and stale viewport session routing. Follow-ups now use the request's saved session, validate that session still exists, and bind the tab to it. The app releases its preparation lock before dispatching the drawer message.

Generation, selected-slide/element edits and image descriptions use the drawer. draftDeck is preparation only; getDrawerRequest, commitDrawerRequest and cancelDrawerRequest implement the saved workflow. Scope masking protects other slides, siblings, shared styles and root geometry, including multi-selection index stability. Existing notes, builds, checks and exports remain app-owned.

## Verification

22 focused tests pass. Affected-app typecheck/build and git diff --check pass. No broad suite was run.

Commands: `npm test -- src/lib/drawerRequest.test.ts src/lib/deckDoor.test.ts src/lib/draftDeck.test.ts`, `npm run typecheck`, `npm run build`. The changed request tests were rerun after the final request/session/description fixes.

Live: created three slides, committed through normal approval, checkDeck returned clean with no findings, exported a three-page PDF. The PDF was reopened from disk with pdfinfo (3 pages, 85,133 bytes). A scoped follow-up exposed stale session routing; that was fixed in all three creative apps. Its QA request association was repaired manually to the test session. The follow-up is still waiting at commit approval because the Mac locked. Do not claim the scoped repair or complete downstream handoff passed live.

## Remaining acceptance work

Full fault-injected app I/O tests (save failure, double commit, cancellation/document switch), live image-pixel description handoff, and the remaining live scenarios are not certified by the helper tests. The Mac must be unlocked to continue UI acceptance. Large-bundle warnings are non-blocking build warnings.
