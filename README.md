# Scrim

Review a screenshot before sharing it. Real English neural OCR runs on the device to suggest email and phone lines. Review those suggestions, draw any additional masks, and create a flattened PNG with a visible export check.

[Live workspace](https://x44ylan.com/scrim/) · [Source and model provenance](vendor/manifest.json) · [Design evidence](research.md)

## Try the complete workflow

Use the clearly labelled fictional support-chat screenshot, then scan it. Review the suggested contact masks and manually cover the six-digit badge code: it deliberately falls outside email/phone pattern detection. Confirm that you have reviewed the entire image, then export and check the new image. The download is a fresh PNG with opaque masks.

Names, faces, addresses, QR codes and other sensitive context need manual review. OCR may miss the same text in both scans. The export check reports recognised email/phone patterns; it does not certify that an image is private or anonymous.

## Local use

```sh
python3 -m http.server 8212 --bind 127.0.0.1
```

Open `http://127.0.0.1:8212`. There is no build step, API key, account, inference bill or GPU requirement. OCR code and model assets are served from the same origin. After a successful online scan, the static assets are cached for offline use in that browser.

Accepts one PNG or JPEG at a time, up to 8 MB, 4 million decoded pixels, and 4000 pixels in either dimension. OCR uses a pretrained English LSTM model. Small, split, rotated and low-contrast text can be missed. Phone-like reference numbers can be false positives; keep the review step.

Imported images, recognised text, masks and exported previews remain in memory. Clear removes that state; reloading starts a new review. Model assets and application code may be cached, but source images and OCR results are not deliberately stored in localStorage, IndexedDB or a server. A downloaded file is the user's own copy.

## What is AI here?

Tesseract's pretrained LSTM recognises text and region boxes on CPU through WebAssembly. Pattern rules then suggest email/phone lines. Those rules are not a learned classifier. No model was trained or fine-tuned for Scrim.

Tesseract.js/core are pinned to 7.0.0. The English model is pinned to its upstream commit and SHA-256 in [vendor/manifest.json](vendor/manifest.json). Apache-2.0 licences and bundled notices are retained in vendor/. The product code is MIT licensed.

OpenAI Codex assisted with idea, code, design, research, documentation and browser verification. Product code was created for this entry on October 4, 2026 UTC. Existing browser verification scaffolding informed the E2E runner; pretrained OCR code/model are attributed separately. No Shiftproof product code was reused. All examples are fictional. No pilots, testimonials, measured impact or general OCR-accuracy claims are made.

## Verification

[spec.md](spec.md) records acceptance and failure cases before implementation. [fixtures/ground-truth.json](fixtures/ground-truth.json) records independently rendered text and glyph regions before OCR. The browser verifier uses actual local model inference and actual downloaded PNGs; no unit tests or mocked ML.

Run `./verify.sh` against the deployed local release. The verification artifact records fixture detection and misses, mask coverage, output pixels and chunks, timings, import rejection, review invalidation, cancellation and offline operation. Metrics describe these fictional fixtures only.
