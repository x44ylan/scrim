# Evidence and design decisions

## Intended users

Students often need to share a screenshot when asking for help. The proposed interaction is to review visible information before sharing a fresh image. This is a design hypothesis, not evidence of adoption or measured time savings. The examples are fictional and use fictional email addresses and fictional 555 phone numbers.

Scrim suggests email and phone lines from locally recognised English text. Names, faces, addresses, QR codes and other sensitive context require manual review. OCR can miss the same text in the source and the exported image, so a second OCR pass is only an export check.

## Actual AI and provenance

- Tesseract uses an LSTM neural network for text recognition: https://tesseract-ocr.github.io/tessdoc/
- Tesseract.js API: https://github.com/naptha/tesseract.js/blob/master/docs/api.md — local worker, core and language paths, LSTM engine mode, and explicit region output.
- Local installation: https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md — default paths use CDNs, so Scrim supplies its own same-origin assets.
- Fast pretrained English model: https://github.com/tesseract-ocr/tessdata_fast — exact model commit, source URL, SHA-256 and byte sizes are recorded in vendor/manifest.json.

Tesseract.js and core are pinned to 7.0.0. Neural OCR performs inference on CPU through WebAssembly. Pattern matching then selects recognised email and phone lines; the pattern rules are not presented as a learned classifier. No model was trained or fine-tuned for this entry. Third-party code and model licences and bundled notices are retained in vendor/.

OpenAI Codex assisted with the idea, implementation, interface, research, documentation and verification. Product code was created for this entry on October 4, 2026 UTC. Existing browser verification scaffolding informed the E2E runner; pretrained OCR code/model are explicitly attributed. No product code was taken from Shiftproof.

## Lessons from verified winners

Devpost's interviews with Ansh, Nathan and Tristan informed the scope: a few complete features, a graphical interaction, and enough time for a working demonstration and clear submission.

- https://info.devpost.com/blog/user-story-ansh
- https://info.devpost.com/blog/user-story-nathan
- https://info.devpost.com/blog/user-story-tristan

ML Empowerment 2.0's official gallery displays judged winners: https://ml-empowerment-2.devpost.com/project-gallery . Its browser-based AI entries provide a relevant precedent for modest compute. Published winner labels establish awards, not sponsor prize fulfilment. Scrim's scope remains one complete scan → review → export-and-check interaction.

## Contest fit

ML Empowerment 3.0 weights technical implementation 30%, innovation 20%, impact 20%, design/UX 15%, and presentation/documentation 15%. Primary rules and configured dates:

- https://ml-build-challenge-3.devpost.com/
- https://ml-build-challenge-3.devpost.com/rules
- https://ml-build-challenge-3.devpost.com/details/dates

The actual authenticated project form was inspected before building. It permits uploaded screenshots and makes the hosted video field optional. No sponsor account, API or GPU is needed. The configured deadline is October 10, 2026 at 06:45 UTC; the rules body lists a later deadline, so the earlier date controls our work plan. Scheduled results are October 18 at 06:45 UTC. Judged prizes are noncash; participation gifts are excluded from the goal.

## Evaluation

Fixture text and glyph-region ground truth are defined independently before OCR. Browser E2E evidence records actual suggestions, precision/recall for these fixtures, masked output pixels, unchanged non-mask pixels, decoded output dimensions, PNG chunks, remaining recognised patterns and observed CPU timings. Hard cases and misses must be retained. These are prototype checks on fictional images, not general accuracy or privacy guarantees.
