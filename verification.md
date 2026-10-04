# Browser verification

The deployed local release passed **69 end-to-end checks** using real Tesseract LSTM inference, native image imports and actual downloaded PNGs. Repeat with `./verify.sh`; the browser driver, fixture generator and independent PNG reader are public. There are no unit tests or mocked ML.

See [the complete artifact](evidence/verification.json) and [independent ground truth](fixtures/ground-truth.json). These results describe fictional fixtures only.

| Fixture | Complete contacts covered | Extra/partial suggestions | Missed complete contacts | Observed scan wall time |
| --- | ---: | ---: | ---: | ---: |
| Clean support chat | 2/2 | 0 | 0 | 664 ms |
| Contacts split over lines | 0/2 | 1 partial phone line | 2 | 516 ms |
| Faint contacts and a ticket reference | 0/2 | 1 ticket reference | 2 | 535 ms |

A complete contact counts only when suggested regions cover every independently rendered fragment. A partial phone line does not count as a fully protected contact. These measurements are not general OCR accuracy or representative device benchmarks. The difficult cases explain why manual review remains required even when an export check reports zero recognised patterns.

Three actual downloaded PNGs were decoded independently. Their original 1120 × 680 dimensions, opaque alpha, uniformly filled selected masks, unchanged non-mask pixels and valid PNG chunks were verified. Output contained IHDR/IDAT/IEND chunks only; the fictional Comment metadata embedded in the source PNG was absent.

The browser checks also prove import rejection preserves state, JPEG EXIF orientation, scaled/reversed pointer drawing, numeric mask entry, review acknowledgement/reset, leftover recognised contacts withholding downloads, cancellation, no image/OCR persistence in Web Storage or IndexedDB, no upload requests or successful third-party responses, 390px layout, and an offline reload with actual cached-model scan/export.

A real local HTTP 503 for the English model exposed an initialization hang in the first run. The error is now propagated and the real native worker is terminated on failure or Clear; the passing rerun preserved the manual mask and source image. [The original failure artifact](evidence/model-error-before-fix.json) is retained.

Visual inspection also exposed a hidden export result. [The reproduced visibility failure](evidence/export-status-before-fix.json) is retained; the passing rerun verifies visible review, pending, remaining-pattern and completed results, plus Clear hiding the old result.

Product runtime SHA-256 at verification: `133698711ac8fb8aa53bcc20358e25286394f08619132aa7271bbd09f3fb433d` for app.js. The public HTTPS release passed **20 focused browser checks** in a clean isolated session. [Production evidence](evidence/public-verification.json) records the exact app and video hashes, real online/offline neural OCR, manual badge masking, a visible output check, an actual PNG download, and decoded video playback. The actual hosting-injected Cloudflare analytics script was blocked by enforced CSP; successful runtime responses came only from the app host. [Public downloaded PNG](evidence/public-export.png).

[The recorded walkthrough](https://x44ylan.com/scrim/demo.html) shows actual model inference, manual badge masking and an exported PNG download. [Its evidence](evidence/demo.json) records the same runtime hash and visible check result; the actual downloaded image is [demo-export.png](evidence/demo-export.png). Captions sit below the screen recording, which keeps its actual playback speed and reading pauses.
