async page => {
  // CLI orchestration pattern reused from Shiftproof; all fixtures, OCR paths,
  // interaction checks and PNG evidence in this verifier are new for Scrim.
  const output = '../../services/scrim/artifacts';
  const base = await page.evaluate(() => location.origin);
  const checks = [], fixtures = [], exports = [], errors = [], requests = [], responses = [];
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  const timeout = 90000;
  let failureContext;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
  await page.addInitScript(() => {
    window.scrimStorageWrites = [];
    window.scrimVisibleExportStates = [];
    document.addEventListener('DOMContentLoaded', () => {
      const result = document.querySelector('#export-result');
      new MutationObserver(() => {
        if (result.getClientRects().length && getComputedStyle(result).visibility !== 'hidden') {
          window.scrimVisibleExportStates.push(result.dataset.state);
        }
      }).observe(result, { attributes: true, childList: true, subtree: true });
    });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.scrimStorageWrites.push({ key: String(key), length: String(value).length });
      return original.call(this, key, value);
    };
  });

  const proof = async (target = page) => target.evaluate(() => window.scrimProof());
  const box = region => region.bbox;
  const selected = state => state.regions.filter(region => region.selection).map(region => ({ ...box(region) }));
  const stable = state => JSON.stringify({ dimensions: state.dimensions, regions: state.regions, revision: state.revision });
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const bounds = boxes => {
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
  };
  function measure(truth, state) {
    const predictions = state.regions.filter(region => region.origin === 'ocr');
    const groups = [...new Set(truth.contacts.map(contact => contact.group))].map(group => {
      const parts = truth.contacts.filter(contact => contact.group === group);
      return { group, type: parts[0].type, parts: parts.map(part => part.bbox), bbox: bounds(parts.map(part => part.bbox)) };
    });
    const used = new Set(), matches = [];
    for (const contact of groups) {
      const index = predictions.findIndex((region, i) => !used.has(i) && region.type === contact.type && contact.parts.every(part => overlap(part, box(region)) / (part.width * part.height) >= 0.9));
      if (index >= 0) { used.add(index); matches.push(contact.group); }
    }
    const tp = matches.length, fp = predictions.length - tp, fn = groups.length - tp;
    return { fixture: truth.file, definition: 'One-to-one contact detection; predicted same-type rectangle must cover at least 90% of every independently rendered glyph region of that contact. Extra predicted rectangles count as false positives.', true_positives: tp, false_positives: fp, false_negatives: fn, precision: predictions.length ? tp / predictions.length : null, recall: groups.length ? tp / groups.length : null, matches, predictions, timings: state.timings };
  }
  async function importBytes(encoded, name = 'fictional-input.png', mime = 'image/png', target = page) {
    const previousRevision = (await proof(target)).revision;
    await target.locator('#file-input').evaluate((input, value) => {
      const bytes = Uint8Array.from(atob(value.encoded), char => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], value.name, { type: value.mime }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { encoded, name, mime });
    await target.waitForFunction(revision => {
      const state = window.scrimProof();
      return state.revision > revision && state.dimensions.width > 0 && !state.busy;
    }, previousRevision, { timeout });
  }
  async function loaded(target = page) {
    await target.waitForFunction(() => {
      const state = window.scrimProof();
      return state.dimensions.width > 0 && !document.querySelector('#scan-btn').disabled;
    }, null, { timeout });
  }
  async function scan(target = page) {
    const started = Date.now();
    await target.locator('#scan-btn').click();
    await target.waitForFunction(() => {
      const state = window.scrimProof();
      return state.phase !== 'scanning' && !document.querySelector('#scan-btn').disabled;
    }, null, { timeout });
    const state = await proof(target);
    check(!(await target.locator('#error').isVisible()) || !(await target.locator('#error').innerText()).trim(), 'real local OCR completes without an error');
    return { state, wall_ms: Date.now() - started };
  }
  async function manual(rect, target = page) {
    for (const [id, value] of [['mask-x', rect.x], ['mask-y', rect.y], ['mask-width', rect.width], ['mask-height', rect.height]]) await target.locator('#' + id).fill(String(value));
    await target.locator('#add-mask-btn').focus();
    await target.keyboard.press('Enter');
  }
  async function exportFile(name, fixture) {
    await page.locator('#review-confirm').check();
    await page.locator('#export-btn').click();
    await page.locator('#download-link').waitFor({ state: 'visible', timeout });
    const state = await proof();
    check(state.exportCheck && state.exportCheck.status === 'passed' && state.exportCheck.patternCount === 0, 'actual OCR check of output pixels finishes with zero supported patterns');
    check(await page.locator('#export-result').isVisible() && (await page.locator('#export-result').innerText()).includes('not a privacy guarantee'), 'completed export result and review limitation are visible');
    const pending = page.waitForEvent('download');
    await page.locator('#download-link').click();
    const download = await pending;
    check(!await download.failure(), 'browser produces a real PNG download');
    check(/\.png$/i.test(download.suggestedFilename()) && !download.suggestedFilename().includes('private-original'), 'download has a neutral PNG filename');
    await download.saveAs(output + '/' + name);
    exports.push({ file: name, fixture, dimensions: state.dimensions, regions: selected(state), check: state.exportCheck });
    return state;
  }
  async function rejected(name, value) {
    const before = stable(await proof());
    await page.locator('#file-input').evaluate(async (input, fixture) => {
      let file;
      if (fixture.kind === 'oversize') file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
      else if (fixture.kind === 'dimensions' || fixture.kind === 'pixels') {
        const canvas = document.createElement('canvas');
        canvas.width = fixture.kind === 'dimensions' ? 4001 : 2200;
        canvas.height = fixture.kind === 'dimensions' ? 2 : 2200;
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        file = new File([blob], 'large-dimensions.png', { type: 'image/png' });
      } else {
        const bytes = fixture.encoded ? Uint8Array.from(atob(fixture.encoded), char => char.charCodeAt(0)) : new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        file = new File([bytes], fixture.name || 'corrupt.png', { type: fixture.mime || 'image/png' });
      }
      const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForFunction(() => !window.scrimProof().busy, null, { timeout: 15000 });
    await page.locator('#error').waitFor({ state: 'visible', timeout: 15000 });
    check((await page.locator('#error').innerText()).trim().length > 0, name + ': explicit import error');
    check(stable(await proof()) === before, name + ': image, masks and revision preserved');
  }

  let result;
  try {
    await page.goto(base + '/');
    await navigatorReady();
    const groundTruth = await page.evaluate(async () => (await fetch('fixtures/ground-truth.json')).json());
    check(groundTruth.fictional && groundTruth.ground_truth_method.includes('before'), 'fixture ground truth was authored independently before OCR');
    const images = await page.evaluate(async names => {
      const result = {};
      for (const name of names) {
        const bytes = new Uint8Array(await (await fetch('fixtures/' + name)).arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        result[name] = btoa(binary);
      }
      return result;
    }, groundTruth.fixtures.map(fixture => fixture.file));
    await page.locator('#demo-btn').click();
    await loaded();
    check((await proof()).dimensions.width === 1120 && (await proof()).dimensions.height === 680, 'fictional demo loads its real image dimensions');
    check(await page.locator('#export-result').isVisible() && (await page.locator('#export-result').innerText()).includes('Review the whole screenshot'), 'loaded image shows the export review instruction');
    check((await page.locator('body').innerText()).toLowerCase().includes('fictional'), 'demo is visibly labelled fictional');
    await importBytes(images['help.png'], 'private-original-support.png');
    await loaded();
    check((await proof()).regions.length === 0, 'native File/DataTransfer import starts with no stale masks');
    check(await page.locator('#export-btn').isDisabled(), 'export requires explicit review acknowledgement');
    const clean = await scan();
    const cleanMetric = measure(groundTruth.fixtures.find(fixture => fixture.file === 'help.png'), clean.state);
    cleanMetric.wall_ms = clean.wall_ms; fixtures.push(cleanMetric);
    check(cleanMetric.true_positives === 2 && cleanMetric.false_negatives === 0, 'clean fixture detects both independently known email and phone');
    check(clean.state.timings && Object.values(clean.state.timings).some(value => typeof value === 'number' && value > 0), 'proof records actual OCR inference timing');
    check(await page.locator('#review-list input[type="checkbox"]').count() === clean.state.regions.length, 'detected regions render editable review choices');
    await page.screenshot({ path: output + '/scan.png', fullPage: true });
    const phoneIndex = clean.state.regions.findIndex(region => region.type === 'phone');
    check(phoneIndex >= 0 && clean.state.regions.every(region => region.selection), 'real detected contact suggestions start selected');
    await page.locator('#review-list input[type="checkbox"]').nth(phoneIndex).uncheck();
    await page.locator('#review-confirm').check();
    await page.locator('#export-btn').click();
    await page.waitForFunction(() => !window.scrimProof().busy && window.scrimProof().exportCheck.status !== 'pending', null, { timeout });
    const incomplete = await proof();
    check(incomplete.exportCheck.status === 'patterns-remain' && incomplete.exportCheck.patternCount >= 1 && !await page.locator('#download-link').isVisible(), 'actual output OCR finds an unmasked phone and withholds the download');
    check(await page.locator('#export-result').isVisible() && (await page.locator('#export-result').innerText()).includes('Download withheld'), 'remaining-pattern export result is visible');
    check(await page.evaluate(() => window.scrimVisibleExportStates.includes('pending')), 'real export check displays its pending result while running');
    await page.locator('#review-list input[type="checkbox"]').nth(phoneIndex).check();
    await page.locator('#review-confirm').check();
    await manual({ x: 50, y: 410, width: 360, height: 44 });
    check(!(await page.locator('#review-confirm').isChecked()) && await page.locator('#export-btn').isDisabled(), 'adding a numeric manual mask resets review acknowledgement');
    check((await proof()).regions.some(region => region.origin === 'manual' && region.selection), 'keyboard numeric form creates a real selected manual region');
    await page.locator('#review-confirm').check();
    await page.locator('#canvas').scrollIntoViewIfNeeded();
    const canvas = await page.locator('#canvas').boundingBox();
    const dimensions = (await proof()).dimensions;
    check(canvas.width < dimensions.width, 'pointer drawing is verified on a CSS-scaled canvas');
    const point = (x, y) => ({ x: canvas.x + x * canvas.width / dimensions.width, y: canvas.y + y * canvas.height / dimensions.height });
    const from = point(1040, 630), to = point(940, 585);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
    const drawn = (await proof()).regions.filter(region => region.origin === 'manual').at(-1).bbox;
    check(Math.abs(drawn.x - 940) <= 2 && Math.abs(drawn.y - 585) <= 2 && Math.abs(drawn.width - 100) <= 3 && Math.abs(drawn.height - 45) <= 3, 'scaled reversed pointer drawing maps to actual image coordinates');
    check(!(await page.locator('#review-confirm').isChecked()), 'pointer edit resets review acknowledgement');
    await exportFile('clean.png', 'help.png');
    await page.screenshot({ path: output + '/export.png', fullPage: true });
    await manual({ x: 850, y: 20, width: 30, height: 25 });
    check(!(await page.locator('#review-confirm').isChecked()) && !await page.locator('#download-link').isVisible(), 'edit invalidates a completed export and old download');
    await rejected('wrong extension', { encoded: images['help.png'], name: 'fictional.txt', mime: 'image/png' });
    await rejected('wrong MIME type', { encoded: images['help.png'], name: 'fictional.png', mime: 'text/plain' });
    await rejected('corrupt PNG', { kind: 'corrupt' });
    await rejected('file above 8MB', { kind: 'oversize' });
    await rejected('dimension above 4000', { kind: 'dimensions' });
    await rejected('decoded pixels above 4 million', { kind: 'pixels' });

    const rotatedJPEG = await page.evaluate(async encoded => {
      const source = new Image(); source.src = 'data:image/png;base64,' + encoded; await source.decode();
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);
      const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]), char => char.charCodeAt(0));
      // An independent minimal TIFF orientation=6 APP1 segment in a real JPEG.
      const exif = [69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0];
      const bytes = new Uint8Array(jpeg.length + exif.length + 4);
      bytes.set(jpeg.slice(0, 2)); bytes.set([255,225,0,exif.length+2], 2); bytes.set(exif, 6); bytes.set(jpeg.slice(2), 6+exif.length);
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
    }, images['help.png']);
    await importBytes(rotatedJPEG, 'fictional-rotated.jpg', 'image/jpeg'); await loaded();
    check((await proof()).dimensions.width === 680 && (await proof()).dimensions.height === 1120, 'native JPEG import respects independent EXIF orientation');

    for (const filename of ['split.png', 'faint.png']) {
      await importBytes(images[filename], 'fictional-' + filename); await loaded();
      const outcome = await scan();
      const metric = measure(groundTruth.fixtures.find(fixture => fixture.file === filename), outcome.state);
      metric.wall_ms = outcome.wall_ms; fixtures.push(metric);
      check(Number.isFinite(metric.recall) && (metric.precision === null || Number.isFinite(metric.precision)), filename + ': actual precision/recall recorded without requiring perfect detection');
      if (filename === 'faint.png') {
        const harmless = groundTruth.fixtures.find(fixture => fixture.file === filename).non_sensitive_regions[0].bbox;
        const index = outcome.state.regions.findIndex(region => region.origin === 'ocr' && overlap(harmless, box(region)) > 0);
        check(index >= 0, 'hard fixture produces an independently known harmless numeric false positive');
        await page.locator('#review-confirm').check();
        await page.locator('#review-list input[type="checkbox"]').nth(index).uncheck();
        check(!(await page.locator('#review-confirm').isChecked()) && !(await proof()).regions[index].selection, 'false positive is deselected and acknowledgement resets');
        // Mask the supported-pattern ticket manually for the output scan: this
        // shows that the export gate examines actual pixels, not checkbox state.
        await manual({ x: 45, y: 200, width: 1050, height: 230 });
        await exportFile('faint.png', filename);
      }
    }

    await importBytes(images['help.png']); await loaded();
    await page.locator('#scan-btn').click();
    await page.waitForFunction(() => window.scrimProof().phase === 'scanning', null, { timeout: 5000 });
    check(await page.locator('#clear-btn').isEnabled(), 'Clear remains available during actual OCR');
    await page.locator('#clear-btn').click();
    await page.waitForFunction(() => window.scrimProof().dimensions.width === 0, null, { timeout: 15000 });
    await page.waitForTimeout(Math.min(15000, Math.max(2500, clean.wall_ms * 2)));
    const cancelled = await proof();
    check(cancelled.dimensions.width === 0 && cancelled.regions.length === 0 && !await page.locator('#download-link').isVisible(), 'Clear cancels in-flight OCR and stale results cannot restore the image');
    check(!(await page.locator('#review-confirm').isChecked()), 'Clear removes review acknowledgement');
    check(!await page.locator('#export-result').isVisible(), 'Clear hides the previous export result');

    failureContext = await page.context().browser().newContext();
    const failurePage = await failureContext.newPage();
    const missingRequests = [];
    failureContext.on('request', request => requests.push({ url: request.url(), method: request.method() }));
    failureContext.on('response', response => { responses.push({ url: response.url(), status: response.status() }); if (response.status() >= 400) missingRequests.push(response.url()); });
    failurePage.on('pageerror', error => errors.push(error.message));
    await failurePage.goto('http://127.0.0.1:8213/');
    await importBytes(images['help.png'], 'fictional.png', 'image/png', failurePage); await loaded(failurePage);
    await manual({ x: 40, y: 230, width: 620, height: 130 }, failurePage);
    const beforeMissing = stable(await proof(failurePage));
    await failurePage.locator('#scan-btn').click();
    await failurePage.locator('#error').waitFor({ state: 'visible', timeout });
    check((await failurePage.locator('#error').innerText()).trim().length > 0, 'missing local language asset produces an actual retryable model/cache error');
    check(stable(await proof(failurePage)) === beforeMissing, 'failed model loading preserves the source image and manual mask');
    await failureContext.close(); failureContext = null;

    await page.setViewportSize({ width: 390, height: 844 });
    await importBytes(images['help.png']); await loaded();
    await scan();
    await manual({ x: 45, y: 245, width: 650, height: 115 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px layout has no horizontal overflow');
    await page.screenshot({ path: output + '/mobile.png', fullPage: true });
    await page.locator('#review-confirm').focus(); await page.keyboard.press('Space');
    check(await page.locator('#review-confirm').isChecked(), 'mobile-width review acknowledgement works from the keyboard');

    await navigatorReady();
    await page.context().setOffline(true);
    await page.reload();
    check((await proof()).dimensions.width === 0 && (await proof()).regions.length === 0, 'reload does not persist uploaded image pixels or OCR regions');
    await importBytes(images['help.png'], 'offline-fictional.png'); await loaded();
    const offline = await scan();
    const offlineMetric = measure(groundTruth.fixtures.find(fixture => fixture.file === 'help.png'), offline.state);
    check(offlineMetric.true_positives === 2, 'offline reload invokes the real cached neural model and detects both contacts');
    await exportFile('offline.png', 'help.png');
    check(await page.evaluate(() => window.scrimStorageWrites.length === 0 && localStorage.length === 0 && sessionStorage.length === 0), 'workflow writes no image or OCR text to Web Storage');
    const databases = await page.evaluate(async () => typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []);
    check(databases.length === 0, 'OCR cache is disabled and workflow creates no IndexedDB database');
    check(requests.every(request => request.method === 'GET'), 'image workflow sends no server upload or mutation request');
    const isLocal = url => url.startsWith(base + '/') || url.startsWith('http://127.0.0.1:8213/') || url.startsWith('blob:') || url.startsWith('data:');
    check(responses.filter(response => response.status >= 200 && response.status < 400).every(response => isLocal(response.url)), 'no successful third-party runtime response during scan, export or offline workflow');
    check(errors.length === 0, 'browser workflows produce no uncaught JavaScript errors');
    result = { result: 'passed', verified_at: new Date().toISOString(), scope: 'Fictional fixtures; real local Tesseract LSTM OCR; native files, browser downloads, cancellation, missing-model handling and offline reload.', scaffolding_reuse: 'Playwright CLI session/result/download pattern from Shiftproof only; no product code reused.', ground_truth: groundTruth, missing_model_responses: missingRequests, checks, fixtures, exports, screenshots: ['scan.png', 'export.png', 'mobile.png'], requests, responses, errors };
  } catch (error) {
    result = { result: 'failed', verified_at: new Date().toISOString(), error: error.message, checks, fixtures, exports, errors };
  } finally {
    if (failureContext) await failureContext.close();
    await page.context().setOffline(false);
    await page.evaluate(value => { window.scrimVerificationResult = value; }, result);
  }
  return result;

  async function navigatorReady() {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
  }
}
