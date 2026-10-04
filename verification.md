# Browser verification

The deployed local release passed **62 end-to-end checks** using real Tesseract LSTM inference, native image imports and actual downloaded PNGs. Repeat with `./verify.sh`; the browser driver, fixture generator and independent PNG reader are public. There are no unit tests or mocked ML.

See [the complete artifact](evidence/verification.json) and [independent ground truth](fixtures/ground-truth.json). These results describe fictional fixtures only.

| Fixture | Complete contacts covered | Extra/partial suggestions | Missed complete contacts | Observed scan wall time |
| --- | ---: | ---: | ---: | ---: |
| Clean support chat | 2/2 | 0 | 0 | 658 ms |
| Contacts split over lines | 0/2 | 1 partial phone line | 2 | 493 ms |
| Faint contacts and a ticket reference | 0/2 | 1 ticket reference | 2 | 518 ms |

A complete contact counts only when suggested regions cover every independently rendered fragment. A partial phone line does not count as a fully protected contact. These measurements are not general OCR accuracy or representative device benchmarks. The difficult cases explain why manual review remains required even when an export check reports zero recognised patterns.

Three actual downloaded PNGs were decoded independently. Their original 1120 × 680 dimensions, opaque alpha, uniformly filled selected masks, unchanged non-mask pixels and valid PNG chunks were verified. Output contained IHDR/IDAT/IEND chunks only; the fictional Comment metadata embedded in the source PNG was absent.

The browser checks also prove import rejection preserves state, JPEG EXIF orientation, scaled/reversed pointer drawing, numeric mask entry, review acknowledgement/reset, leftover recognised contacts withholding downloads, cancellation, no image/OCR persistence in Web Storage or IndexedDB, no upload requests or successful third-party responses, 390px layout, and an offline reload with actual cached-model scan/export.

A real local HTTP 503 for the English model exposed an initialization hang in the first run. The error is now propagated and the real native worker is terminated on failure or Clear; the passing rerun preserved the manual mask and source image. [The original failure artifact](evidence/model-error-before-fix.json) is retained.

Product runtime SHA-256 at verification: `cd53e13c494516db1890d9ae088e9a575614dd44e3dae3d12a5c4d75f91dbad8` for app.js. Hosted-production verification is recorded separately after publication.
