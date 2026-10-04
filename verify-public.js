async page => {
  const base = 'https://x44ylan.com/scrim/';
  const expectedAppHash = '133698711ac8fb8aa53bcc20358e25286394f08619132aa7271bbd09f3fb433d';
  const expectedVideoHash = 'be60cd937599cd141e677c4e80f50b73e7a565fd67f4e704db64bfd813c1611a';
  const output = '../../services/scrim/artifacts';
  const checks = [], responses = [], requests = [], failures = [], errors = [];
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  const timeout = 90000;
  page.context().on('response', response => responses.push({ url: response.url(), status: response.status() }));
  page.context().on('request', request => requests.push({ url: request.url(), method: request.method() }));
  page.context().on('requestfailed', request => failures.push({ url: request.url(), reason: request.failure()?.errorText }));
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addInitScript(() => {
    window.scrimPublicCSP = [];
    addEventListener('securitypolicyviolation', event => window.scrimPublicCSP.push({ blockedURI: event.blockedURI, directive: event.effectiveDirective, disposition: event.disposition }));
  });
  let result;
  try {
    const response = await page.goto(base);
    check(response && response.status() === 200, 'public application responds HTTP200 in a clean isolated browser');
    await page.waitForFunction(() => typeof window.scrimProof === 'function');
    const assets = await page.evaluate(async () => {
      const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const appResponse = await fetch('app.js');
      const imageResponse = await fetch('fixtures/help.png');
      const videoResponse = await fetch('demo.webm');
      const truthResponse = await fetch('fixtures/ground-truth.json');
      const truth = await truthResponse.json();
      return { appStatus: appResponse.status, appHash: await hash(await appResponse.arrayBuffer()), imageStatus: imageResponse.status, imageHash: await hash(await imageResponse.arrayBuffer()), videoStatus: videoResponse.status, videoHash: await hash(await videoResponse.arrayBuffer()), truth: truth.fixtures.find(fixture => fixture.file === 'help.png') };
    });
    check(assets.appStatus === 200 && assets.appHash === expectedAppHash, 'runtime app.js SHA256 matches the accepted implementation');
    check(assets.imageStatus === 200 && assets.imageHash === assets.truth.sha256, 'published clean fixture matches independent ground-truth source bytes');
    check(assets.videoStatus === 200 && assets.videoHash === expectedVideoHash, 'published walkthrough SHA256 matches the final recorded video');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
    await page.locator('#demo-btn').click();
    await page.waitForFunction(() => window.scrimProof().dimensions.width === 1120 && !window.scrimProof().busy);
    await page.locator('#scan-btn').click();
    await page.waitForFunction(() => !window.scrimProof().busy && window.scrimProof().phase === 'review', null, { timeout });
    const scan = await page.evaluate(() => window.scrimProof());
    const coverage = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) / (a.width * a.height);
    check(assets.truth.contacts.every(contact => scan.regions.some(region => region.origin === 'ocr' && region.type === contact.type && coverage(contact.bbox, region.bbox) >= 0.9)), 'public real local LSTM scan covers both independently known clean contacts');
    check(scan.timings.scanMs > 0 && scan.regions.every(region => region.selection), 'actual public scan records inference timing and selected suggestions');
    for (const [id, value] of [['mask-x', 50], ['mask-y', 410], ['mask-width', 360], ['mask-height', 44]]) await page.locator('#' + id).fill(String(value));
    await page.locator('#add-mask-btn').click();
    const manual = await page.evaluate(() => window.scrimProof());
    check(manual.regions.some(region => region.origin === 'manual' && region.selection && region.bbox.x === 50 && region.bbox.y === 410), 'public numeric form adds a real opaque badge mask');
    await page.locator('#review-confirm').check();
    await page.locator('#export-btn').click();
    await page.locator('#download-link').waitFor({ state: 'visible', timeout });
    const exported = await page.evaluate(() => window.scrimProof());
    check(exported.exportCheck.status === 'passed' && exported.exportCheck.patternCount === 0 && exported.timings.exportMs > 0, 'public PNG export performs actual OCR on its output pixels');
    check(await page.locator('#export-result').isVisible() && /no supported email or phone pattern/i.test(await page.locator('#export-result').innerText()), 'completed public export check and its result are visible to the user');
    const pending = page.waitForEvent('download');
    await page.locator('#download-link').click();
    const download = await pending;
    await download.saveAs(output + '/public-export.png');
    check(!await download.failure() && download.suggestedFilename() === 'scrim-redacted.png', 'public workflow saves a real neutral-name PNG download');
    await page.screenshot({ path: output + '/public-screenshot.png', fullPage: true });
    const onlinePolicy = await page.evaluate(() => ({ policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, violations: window.scrimPublicCSP, scripts: [...document.scripts].filter(script => script.src && new URL(script.src).hostname !== location.hostname).map(script => script.src) }));
    check(/script-src\s+'self'(?:\s|;)/.test(onlinePolicy.policy), 'production CSP restricts scripts to the application origin');
    const injectedAnalytics = onlinePolicy.scripts.filter(src => /cloudflareinsights|analytics|beacon/i.test(src));
    for (const script of injectedAnalytics) {
      const origin = await page.evaluate(src => new URL(src).origin, script);
      check(onlinePolicy.violations.some(violation => violation.disposition === 'enforce' && violation.directive.startsWith('script-src') && (violation.blockedURI === script || violation.blockedURI.startsWith(origin))), 'hosting-injected analytics script is blocked by enforced CSP');
    }
    const demoPage = await page.context().newPage();
    demoPage.on('pageerror', error => errors.push(error.message));
    const demoResponse = await demoPage.goto(base + 'demo.html');
    check(demoResponse && demoResponse.status() === 200, 'published walkthrough page responds HTTP200');
    await demoPage.waitForFunction(() => { const video = document.querySelector('video'); return video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0; }, null, { timeout: 30000 });
    await demoPage.locator('video').evaluate(video => { video.muted = true; return video.play(); });
    await demoPage.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime > 0.3 && !video.paused && video.getVideoPlaybackQuality().totalVideoFrames > 0; }, null, { timeout: 15000 });
    const demo = await demoPage.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, current_time: video.currentTime, decoded_frames: video.getVideoPlaybackQuality().totalVideoFrames, error: video.error?.message || null }));
    check(demo.width > 0 && demo.height > 0 && !demo.error && demo.decoded_frames > 0, 'published video metadata and actual decoded playback succeed');
    await demoPage.locator('video').evaluate(video => video.pause());
    await demoPage.close();
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.scrimProof === 'function');
    check((await page.evaluate(() => window.scrimProof())).dimensions.width === 0, 'public offline reload retains the app without persisting uploaded image state');
    await page.locator('#demo-btn').click();
    await page.waitForFunction(() => window.scrimProof().dimensions.width === 1120 && !window.scrimProof().busy);
    await page.locator('#scan-btn').click();
    await page.waitForFunction(() => !window.scrimProof().busy && window.scrimProof().phase === 'review', null, { timeout });
    const offline = await page.evaluate(() => window.scrimProof());
    check(assets.truth.contacts.every(contact => offline.regions.some(region => region.origin === 'ocr' && region.type === contact.type && coverage(contact.bbox, region.bbox) >= 0.9)) && offline.timings.scanMs > 0, 'offline production reload completes another real local LSTM scan');
    check(responses.filter(response => response.status >= 200 && response.status < 400 && /^https?:\/\//.test(response.url)).every(response => response.url.startsWith('https://x44ylan.com/')), 'every successful runtime network response comes from the same production host');
    check(requests.every(request => request.method === 'GET'), 'public image workflow sends no upload or server mutation');
    check(errors.length === 0, 'public workflows produce no uncaught JavaScript error');
    result = { result: 'passed', verified_at: new Date().toISOString(), origin: base, scope: 'Focused production browser proof only: real local OCR, manual badge mask, visible checked PNG download, actual walkthrough playback, offline reload/scan and same-host runtime responses.', checks, app_sha256: assets.appHash, fixture_sha256: assets.imageHash, video_sha256: assets.videoHash, demo, scan, exported, offline, hosting_analytics: { injected_scripts: injectedAnalytics, outcome: injectedAnalytics.length ? 'blocked-by-enforced-csp' : 'no-analytics-script-present', csp: onlinePolicy }, download: { file: 'public-export.png', suggested_filename: download.suggestedFilename(), dimensions: exported.dimensions }, screenshot: 'public-screenshot.png', requests, responses, request_failures: failures, errors };
  } catch (error) {
    result = { result: 'failed', verified_at: new Date().toISOString(), origin: base, error: error.message, checks, requests, responses, request_failures: failures, errors };
  } finally {
    await page.context().setOffline(false);
    await page.evaluate(value => { window.scrimPublicVerification = value; }, result);
  }
  return result;
}
