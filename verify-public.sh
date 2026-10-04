#!/usr/bin/env bash
set -euo pipefail
umask 077
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$source_dir"
artifacts=/home/dylan/services/scrim/artifacts
install -d -m 700 "$artifacts"
config=$(mktemp)
result=$(mktemp "$artifacts/public-result.XXXXXX")
cleanup() {
  rm -f "$config" "$result"
  playwright-cli -s=scrim-public close >/dev/null 2>&1 || true
}
trap cleanup EXIT
python3 - "$config" <<'PY'
import json, sys
from pathlib import Path
browsers = sorted((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux64/chrome'), key=lambda p: int(p.parents[1].name.split('-')[1]), reverse=True)
if not browsers: raise SystemExit('Install Playwright Chromium before verifying')
Path(sys.argv[1]).write_text(json.dumps({'browser': {'browserName': 'chromium', 'isolated': True, 'launchOptions': {'executablePath': str(browsers[0]), 'headless': True}, 'contextOptions': {'viewport': {'width': 1200, 'height': 980}, 'reducedMotion': 'reduce', 'acceptDownloads': True}}}))
PY
playwright-cli -s=scrim-public open about:blank --config="$config"
playwright-cli -s=scrim-public run-code --filename=verify-public.js > "$artifacts/public-verification-browser.log"
playwright-cli -s=scrim-public eval 'window.scrimPublicVerification' > "$result"
python3 - "$result" "$artifacts" <<'PY'
import hashlib, json, struct, sys
from pathlib import Path
raw = Path(sys.argv[1]).read_text()
artifacts = Path(sys.argv[2])
if '### Result' not in raw: raise SystemExit('Missing browser evidence; inspect public-verification-browser.log')
result, _ = json.JSONDecoder().raw_decode(raw.split('### Result', 1)[1].lstrip())
if not isinstance(result, dict) or result.get('result') != 'passed':
    (artifacts/'public-verification-failed.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
    raise SystemExit('Focused production E2E did not pass')
data = (artifacts/result['download']['file']).read_bytes()
assert data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR', 'Downloaded production file is a real PNG'
dimensions = struct.unpack('>II', data[16:24])
assert dimensions == (result['download']['dimensions']['width'], result['download']['dimensions']['height']), 'Production PNG has the original dimensions'
result['download']['sha256'] = hashlib.sha256(data).hexdigest()
result['download']['bytes'] = len(data)
result['checks'].append('Actual saved production PNG signature and dimensions match the browser proof')
(artifacts/'public-verification.json').write_text(json.dumps(result, indent=2)+'\n')
(artifacts/'public-verification-failed.json').unlink(missing_ok=True)
print(json.dumps({'result': result['result'], 'checks': len(result['checks']), 'app_sha256': result['app_sha256'], 'online_scan_ms': result['scan']['timings']['scanMs'], 'offline_scan_ms': result['offline']['timings']['scanMs'], 'hosting_analytics': result['hosting_analytics']['outcome'], 'artifact': str(artifacts/'public-verification.json')}, indent=2))
PY
