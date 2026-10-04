# Scrim

## Tagline

Review a screenshot before you share it.

## Problem and intended users

When a student posts a screenshot to ask for help, the useful context can sit beside an email address, phone number or badge code. The proposed tool helps the person sharing it review what to cover without uploading the image to an inference service.

This is a prototype for that workflow. It has no claimed users, pilots or measured social impact. All demonstration images and contact details are explicitly fictional.

## What it does

Load one PNG or JPEG and scan it with real English neural OCR on the device. Scrim suggests full email and phone lines as mask regions. The person reviewing the screenshot can deselect false positives and draw additional opaque masks, or enter exact pixel coordinates with a keyboard.

After the whole image has been reviewed, Scrim creates a new white-backed PNG with the selected masks written into its pixels. It decodes that actual output and runs OCR again. A ready download appears only after the completed check recognises no supported email or phone patterns at the current revision.

That result is an export check, not a privacy guarantee. The same OCR can miss the same text twice. Names, faces, addresses, QR codes and other sensitive context still require manual review. The fictional example includes a six-digit badge code that intentionally needs a manual mask.

## AI and implementation

Tesseract.js and Tesseract.js-core 7.0.0 run a pretrained Tesseract LSTM English model on CPU through WebAssembly. The neural model recognises text and region boxes; ordinary pattern rules select recognised email and phone lines. The pattern rules are not a trained classifier. No model was trained or fine-tuned for Scrim.

OCR scripts, worker, engine variants and the English model are all hosted with the app. Exact model provenance, commit, SHA-256 and licences are public in [the model manifest](https://github.com/x44ylan/scrim/blob/main/vendor/manifest.json). There is no inference API, account, GPU or paid runtime resource.

Plain HTML, CSS and JavaScript implement the review. A service worker caches static assets for offline use after a successful scan. Uploaded images, recognised text and review state remain in memory; the app does not upload them or deliberately persist them in localStorage or IndexedDB. The downloadable PNG is a new raster image rather than a layered overlay or the original file.

OpenAI Codex assisted with the idea, implementation, interface, research, documentation and browser verification. Product code was created for this contest on October 4, 2026 UTC. Existing browser verification scaffolding informed the E2E runner. Pretrained OCR code/model are separately attributed, with licences retained. No Shiftproof product code was reused.

## Technical challenges

Mask coordinates must remain correct when a screenshot is scaled on a small screen. Image headers need bounded validation before decoding. A failed import should preserve the current review, and clearing an in-flight job must prevent stale results from restoring it. Every edit invalidates the acknowledgement and prior download.

The harder challenge is avoiding circular evidence: a second OCR pass is not independent proof that private text is gone. Fixture text and rendered glyph regions were therefore defined before OCR. Detection and missed contacts are compared with that ground truth, separately from exported pixel and metadata checks.

## Verification and limits

The repository records actual browser E2E evidence, actual downloaded images and independently authored fictional ground truth. Checks cover real local-model inference, suggestion review, manual masks, review invalidation, import rejection, exported pixels and metadata, cancellation, missing model assets and offline operation. No ML response is mocked.

Per-fixture outcomes and CPU timings describe these images only; they are not a general OCR accuracy or privacy claim. Small, split, rotated or faint text may be missed, and phone-like reference numbers can be false positives.

The next useful validation would be observing real screenshot-sharing workflows and testing comprehension of the mask review and limits. That study has not happened; there are no fabricated testimonials or benefit estimates.

## Try it

[Live workspace](https://x44ylan.com/scrim/) · [Public source and evidence](https://github.com/x44ylan/scrim) · [Research and model references](https://github.com/x44ylan/scrim/blob/main/research.md)

The uploaded screenshots show the fictional example, reviewed masks and the flattened export. Solo entrant: Dylan; development and verification assistance: OpenAI Codex. Judging entries and award claims remain separate from technical prototype validation.
