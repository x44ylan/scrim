async page => {
  // Reuses Shiftproof's Playwright CLI recording orchestration pattern only.
  // Scrim interactions, captions, real OCR and exported-image evidence are new.
  const output = '../../services/scrim/artifacts';
  const started = Date.now();
  const scenes = [], requests = [], errors = [];
  const proof = () => page.evaluate(() => window.scrimProof());
  const pause = seconds => page.waitForTimeout(seconds * 1000);
  const scene = (title, detail) => scenes.push({start_seconds:(Date.now()-started)/1000,title,detail});
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({url:request.url(),method:request.method()}));

  await page.setViewportSize({width:1280,height:900});
  await page.goto('http://127.0.0.1:8212/');
  await page.waitForFunction(() => typeof window.scrimProof === 'function');
  const runtimeSha256 = await page.evaluate(async () => {
    const bytes = await (await fetch('app.js', {cache:'no-store'})).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  });
  scene('Recorded walkthrough · A fictional screenshot', 'Actual browser actions and local scans. Pauses give you time to read.');
  await pause(5);
  const truth = await page.evaluate(async () => (await fetch('fixtures/ground-truth.json')).json());
  if (!truth.fictional) throw new Error('The walkthrough must use fictional data.');
  const fixture = truth.fixtures.find(item => item.file === 'help.png');
  const badge = fixture.non_sensitive_regions.find(item => item.text.startsWith('Badge code:')).bbox;
  const manual = {x:badge.x-8,y:badge.y-8,width:badge.width+16,height:badge.height+16};

  scene('1 · Choose an image', 'This example and its contact details are fictional. Source pixels stay in browser memory.');
  await page.locator('#demo-btn').click();
  await page.waitForFunction(() => window.scrimProof().dimensions.width > 0 && !window.scrimProof().busy);
  await pause(6);

  scene('Scan for English email and phone lines', 'This step uses real local OCR. The recording pauses after completion so you can review.');
  const scanStarted = Date.now();
  await page.locator('#scan-btn').click();
  await page.waitForFunction(() => window.scrimProof().phase === 'review' && !window.scrimProof().busy, null, {timeout:90000});
  const scan = await proof();
  const scanWallMs = Date.now()-scanStarted;
  if (!scan.regions.some(region=>region.type==='email') || !scan.regions.some(region=>region.type==='phone')) throw new Error('Expected real contact suggestions were not produced.');
  await pause(4);

  scene('2 · Review the suggested masks', 'Recognised email and phone lines are selected. You can keep or remove each mask.');
  await page.locator('#review-list').scrollIntoViewIfNeeded();
  await pause(6);
  scene('Every suggestion is your choice', 'Toggling the phone suggestion changes the mask. It is selected again for this export.');
  const phoneIndex = scan.regions.findIndex(region=>region.type==='phone');
  await page.locator('#review-list input[type="checkbox"]').nth(phoneIndex).uncheck();
  await pause(3);
  await page.locator('#review-list input[type="checkbox"]').nth(phoneIndex).check();
  await pause(3);

  scene('Add details the scan does not cover', 'The badge code is outside supported patterns. A manual rectangle covers it.');
  await page.locator('#manual-form').scrollIntoViewIfNeeded();
  for (const [id,value] of [['mask-x',manual.x],['mask-y',manual.y],['mask-width',manual.width],['mask-height',manual.height]]) {
    await page.locator('#'+id).fill(String(value));
    await pause(.45);
  }
  await page.locator('#add-mask-btn').click();
  await pause(6);

  scene('Look at the whole image', 'Names, faces, addresses, QR codes and missed text all require manual review.');
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  await pause(6);
  const reviewed = await proof();
  if (!reviewed.regions.some(region=>region.origin==='manual'&&region.selection)) throw new Error('Manual mask was not added.');

  scene('3 · Confirm your review', 'The review checkbox is required. Any mask edit resets this acknowledgement.');
  await page.locator('#review-confirm').scrollIntoViewIfNeeded();
  await page.locator('#review-confirm').check();
  await pause(6);

  scene('Create a fresh PNG and check its actual pixels', 'Opaque masks are flattened into the output. Real OCR scans that exported image.');
  const exportStarted = Date.now();
  await page.locator('#export-btn').click();
  await page.locator('#download-link').waitFor({state:'visible',timeout:90000});
  await page.locator('#export-result').waitFor({state:'visible',timeout:10000});
  const exported = await proof();
  const exportResultText = await page.locator('#export-result').innerText();
  const exportWallMs = Date.now()-exportStarted;
  if (!exported.readyDownload || exported.exportCheck.status!=='passed' || exported.exportCheck.patternCount!==0) throw new Error('A completed zero-pattern check was not produced.');
  await pause(5);

  scene('Inspect the exported preview', 'This real output contains the selected masks. The check found zero supported patterns here.');
  await page.locator('#export-preview').scrollIntoViewIfNeeded();
  await pause(9);
  scene('Download the checked PNG', 'A new image is downloaded with a neutral filename, rather than the source file.');
  const pending = page.waitForEvent('download');
  await page.locator('#download-link').click();
  const download = await pending;
  if (await download.failure()) throw new Error('The real browser download failed.');
  await download.saveAs(output+'/demo-export.png');
  await pause(6);

  scene('The same OCR can miss the same detail twice', 'A zero result is not a privacy guarantee. Check the full image before sharing.');
  await page.locator('.export-explanation').scrollIntoViewIfNeeded();
  await pause(8);
  return {recorded_at:new Date(started).toISOString(),workflow_duration_seconds:(Date.now()-started)/1000,
    result:'completed',fictional:true,fixture:'help.png',fixture_sha256:fixture.sha256,runtime_app_sha256:runtimeSha256,
    recording:'Continuous actual browser screen recording; no mocked OCR or changed playback speed. Reading pauses are included.',
    tooling_reuse:'Shiftproof Playwright CLI orchestration pattern only; no Shiftproof product code.',
    scenes,scan_wall_ms:scanWallMs,export_wall_ms:exportWallMs,scan_proof:scan,review_proof:reviewed,export_proof:exported,export_result_text:exportResultText,
    manual_badge_rectangle:manual,download:{file:'demo-export.png',suggested_filename:download.suggestedFilename()},
    errors,successful_external_requests_claimed:false,external_requests:requests.filter(request=>!request.url.startsWith('http://127.0.0.1:8212/')&&!request.url.startsWith('blob:')&&!request.url.startsWith('data:'))};
}
