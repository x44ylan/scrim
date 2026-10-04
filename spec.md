# Scrim acceptance contract

Recorded before product implementation on October 4, 2026 UTC. An original entry for ML Empowerment Build Challenge 3.0; no Shiftproof product code will be reused. Existing browser verification patterns and publicly licensed OCR dependencies are disclosed separately.

## Outcome

A student can load a screenshot, use real on-device English neural OCR to suggest email/phone lines, review or draw opaque masks, and download a flattened PNG after checking the exported pixels with OCR. The whole workflow is local, free and CPU-based. The export check detects recognised supported patterns; it is never a privacy guarantee.

## Scope and stop

One image and one OCR worker. PNG/JPEG up to 8 MB and 4 million decoded pixels, each dimension at most 4000. English text only. Local pretrained Tesseract LSTM inference; regexes select recognised email and phone lines. No API, account, GPU, cloud image upload, model training, bulk mode, PDF, chatbot, sponsor integration, or claimed user study. Stop building after the complete scan → review → export-and-check workflow and its E2E evidence pass.

## Failures to handle before implementation

1. Wrong extension/MIME, corrupt image, huge file or decoded dimensions, unsupported image type, transparent pixels and EXIF orientation. Reject without replacing the current review. Rasterise onto white; never export the source file or metadata.
2. Small, rotated, low-contrast, split or unfamiliar text; OCR may miss the same string in both scans. Independently known fictional text and region ground truth must assess detection. Names, faces, addresses and QR codes require manual review.
3. Pattern false positives, OCR punctuation errors, repeated strings, or an email/phone split across word/line boxes. Suggest full detected line regions, visibly editable; do not claim universal detection.
4. Reversed drawing, CSS scaling, mobile pointer capture, out-of-bounds coordinates, tiny/invalid rectangles, keyboard-only operation. Clamp valid geometry; support numeric rectangle entry as well as pointer drawing.
5. Missing worker/core/model assets, unsupported WASM, scan errors and repeated attempts. Preserve the image and existing manual masks; give a clear retryable error.
6. Clear/new image during work, stale worker results, repeat export and edits after export. Ignore stale results, cancel on Clear, invalidate review acknowledgement and old downloads after changes. Disable conflicting actions during work.
7. Unchecked review acknowledgement, hidden original pixels, alpha, cosmetic blur instead of an opaque mask, source metadata/filename leaking into export. Require explicit review; write opaque masks into a new white-backed canvas; export a fresh PNG with a neutral filename.
8. Remaining recognised email/phone patterns or a failed export scan. Show the actual check result, withhold a ready download, and let the user return to review/retry. A zero result still needs visual review.
9. Internet loss, third-party/CDN defaults, hosting analytics injection and offline cache gaps. Host all OCR code/model assets locally, block external scripts with CSP, cache assets for offline use after a successful scan; do not persist source images or OCR text.
10. Verification bias, fake impact, or invented model performance. Use actual OCR and browser downloads. Report per-fixture precision/recall and latency, including failures; do not generalise to accuracy on real users' screenshots.

## Observable acceptance

- Loading the clearly fictional screenshot and clicking Scan invokes the real locally hosted LSTM model and renders detected line boxes and selectable suggestions.
- Supported import failures leave the prior image/masks intact. Image state and OCR text are never put in localStorage, IndexedDB or a server request.
- The clean fixture's email and phone are detected and covered. Ground truth is independently defined before OCR; harder fixtures report actual outcomes without a required perfect score.
- False positives can be deselected; manual opaque regions can be added by pointer and numeric form at actual image coordinates.
- Clear removes all image/region/export state, including an in-flight job. A stale result cannot restore it.
- Review acknowledgement is required and resets after every meaningful edit. Export creates an independent PNG, runs actual OCR on those output pixels, shows recognised pattern results, and only provides a ready download after a completed check with zero supported patterns.
- Downloaded PNG decodes to the original dimensions on a white opaque background. Independent pixel checks prove selected region coverage and unchanged non-mask pixels. Parse PNG chunks and do not embed the original image, filename or OCR text.
- English OCR's language/coverage limits remain visible in the UI; the checked export is not called safe, anonymous or guaranteed private.
- Desktop and 390px mobile interaction complete without horizontal overflow. All text is rendered safely as text, not inserted HTML from an image.
- After one successful scan, an offline reload can load the app and complete a second scan and export with local assets. No successful third-party network responses during the workflow.
- A repeatable browser E2E artifact includes the actual download, screenshots, fixture ground truth, detections, timings and failures. No unit tests.

## Integration seam

UI owner: index.html and style.css. Behaviour owner: app.js only; add a separate module only if needed for a coherent boundary. Fixture/verifier owner: fixtures/*, verify.js and verify.sh. Root owns vendor assets, sw.js, research/README/submission documentation and publication.

DOM IDs: file-input, demo-btn, scan-btn, clear-btn, canvas, image-shell, empty-state, status, error, progress, review-list, scan-summary, manual-form, mask-x, mask-y, mask-width, mask-height, add-mask-btn, review-confirm, export-btn, export-result, export-preview, download-link. Core sets each canvas's intrinsic dimensions, toggles hidden states and renders review-list. Native buttons/labels and live status/error regions. Add no inline JavaScript or external assets.

App loads vendor/tesseract.min.js then app.js. Worker path vendor/worker.min.js, corePath vendor/core, langPath vendor/lang. Pin Tesseract.js/core 7.0.0 and one English pretrained model with a recorded source/hash/licence. workerBlobURL:false and cacheMethod:none. Request blocks:true explicitly. App state is memory-only; service worker caches static assets only.

Expose read-only window.scrimProof() with dimensions, phase, detected regions (type, bbox, selection, origin), OCR timings, export check summary and revision so E2E can record actual outcomes. Do not replace the worker with a mock. Tests use fictional images exclusively.
