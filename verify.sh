#!/usr/bin/env bash
set -euo pipefail
umask 077
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$source_dir"
artifacts="/home/dylan/services/scrim/artifacts"
install -d -m 700 "$artifacts"
config=$(mktemp)
result=$(mktemp "$artifacts/result.XXXXXX")
model_server_pid=''
cleanup() {
  rm -f "$config" "$result"
  playwright-cli -s=scrim-verify close >/dev/null 2>&1 || true
  if [[ -n "$model_server_pid" ]]; then
    kill "$model_server_pid" >/dev/null 2>&1 || true
    wait "$model_server_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
python3 - "$config" <<'PY'
from pathlib import Path
import json, sys
browsers = sorted((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux64/chrome'), key=lambda p: int(p.parents[1].name.split('-')[1]), reverse=True)
if not browsers:
    raise SystemExit('Install Playwright Chromium before verifying')
Path(sys.argv[1]).write_text(json.dumps({'browser': {'browserName': 'chromium', 'isolated': True, 'launchOptions': {'executablePath': str(browsers[0]), 'headless': True}, 'contextOptions': {'viewport': {'width': 1060, 'height': 980}, 'reducedMotion': 'reduce', 'acceptDownloads': True}}}))
PY
if [[ -n "$(ss -H -ltn 'sport = :8213')" ]]; then
  printf '%s\n' 'Port8213 is occupied; do not disturb another listener.' >&2
  exit 1
fi
python3 "$source_dir/fixtures/missing-model.py" /home/dylan/services/scrim/release 8213 > "$artifacts/missing-model-server.log" 2>&1 &
model_server_pid=$!
python3 - <<'PY'
import time, urllib.error, urllib.request
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8213/', timeout=2) as response:
            if response.status == 200: break
    except (urllib.error.URLError, TimeoutError):
        time.sleep(0.1)
else:
    raise SystemExit('Test-only missing-model listener did not start')
PY
playwright-cli -s=scrim-verify open http://127.0.0.1:8212/ --config="$config"
playwright-cli -s=scrim-verify run-code --filename=verify.js > "$artifacts/verification-browser.log"
# Installed CLI0.1.18 lacks --raw. Read the evidence object explicitly and
# parse only its Result section, never generated code or page snapshot text.
playwright-cli -s=scrim-verify eval 'window.scrimVerificationResult' > "$result"
uv run --no-project --with pillow==12.1.1 python - "$result" "$artifacts" "$source_dir" <<'PY'
import hashlib, json, re, struct, sys, zlib
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

raw = Path(sys.argv[1]).read_text()
artifacts, source = Path(sys.argv[2]), Path(sys.argv[3])
if '### Result' not in raw:
    raise SystemExit('Playwright returned no browser evidence; inspect verification-browser.log')
text = raw.split('### Result', 1)[1].lstrip()
try:
    result, _ = json.JSONDecoder().raw_decode(text)
except (ValueError, TypeError):
    raise SystemExit('Invalid browser evidence; inspect verification-browser.log')
if not isinstance(result, dict) or result.get('result') != 'passed':
    (artifacts/'verification-failed.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    raise SystemExit('Browser E2E did not pass')
truth = json.loads((source/'fixtures/ground-truth.json').read_text())
assert result['ground_truth']['fixtures'] == truth['fixtures'], 'Browser fixture truth matches independently generated source truth'
for fixture in truth['fixtures']:
    assert hashlib.sha256((source/'fixtures'/fixture['file']).read_bytes()).hexdigest() == fixture['sha256'], 'Independent fixture source hash remains unchanged'
assert re.search(r'GET /vendor/lang/eng\.traineddata\.gz(?:\?[^ ]*)? HTTP/[^" ]+" 503', (artifacts/'missing-model-server.log').read_text()), 'Actual OCR requested the unavailable local language asset'
(artifacts/'ground-truth.json').write_text(json.dumps(truth, indent=2) + '\n')
pixel_checks = []
try:
    for export in result['exports']:
        path = artifacts/export['file']
        data = path.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n', f'{path.name}: real PNG signature'
        chunks, offset = [], 8
        while offset < len(data):
            length = struct.unpack('>I', data[offset:offset+4])[0]
            kind = data[offset+4:offset+8]
            payload = data[offset+8:offset+8+length]
            crc = struct.unpack('>I', data[offset+8+length:offset+12+length])[0]
            assert zlib.crc32(kind + payload) & 0xffffffff == crc, f'{path.name}: valid PNG chunk CRC'
            chunks.append(kind.decode('ascii'))
            offset += length + 12
            if kind == b'IEND': break
        assert offset == len(data) and chunks[0] == 'IHDR' and chunks[-1] == 'IEND', f'{path.name}: complete independent PNG'
        assert not set(chunks).intersection({'tEXt','zTXt','iTXt','eXIf'}), f'{path.name}: no source text or EXIF metadata'
        with Image.open(source/'fixtures'/export['fixture']) as raw_source:
            original = Image.new('RGBA', raw_source.size, 'white')
            original.alpha_composite(raw_source.convert('RGBA'))
        with Image.open(path) as decoded:
            actual = decoded.convert('RGBA')
        assert actual.size == original.size == (export['dimensions']['width'], export['dimensions']['height']), f'{path.name}: original dimensions'
        assert actual.getchannel('A').getextrema() == (255,255), f'{path.name}: fully opaque flattened output'
        mask = Image.new('L', actual.size, 0)
        draw = ImageDraw.Draw(mask)
        mask_pixels = 0
        for region in export['regions']:
            x, y, width, height = (region[k] for k in ['x','y','width','height'])
            assert all(isinstance(value,int) for value in [x,y,width,height]), f'{path.name}: integer mask geometry'
            assert 0 <= x < actual.width and 0 <= y < actual.height and width > 0 and height > 0 and x+width <= actual.width and y+height <= actual.height, f'{path.name}: clamped valid mask geometry'
            region_box = (x,y,x+width,y+height)
            crop = actual.crop(region_box)
            assert all(lo == hi for lo,hi in crop.getextrema()), f'{path.name}: each selected mask contains uniform opaque pixels'
            draw.rectangle((x,y,x+width-1,y+height-1), fill=255)
            mask_pixels += width*height
        assert mask_pixels > 0, f'{path.name}: selected masks exported'
        difference = ImageChops.difference(actual, original).convert('RGB')
        nonmask_difference = Image.new('RGB', actual.size, 'black')
        nonmask_difference.paste(difference, mask=ImageChops.invert(mask))
        assert nonmask_difference.getbbox() is None, f'{path.name}: all nonmask pixels unchanged from independently white-backed source'
        pixel_checks.append({'file':path.name,'sha256':hashlib.sha256(data).hexdigest(),'dimensions':list(actual.size),'chunks':chunks,'opaque_alpha':True,'selected_regions_uniform':True,'nonmask_pixels_unchanged':True,'selected_region_area':mask_pixels})
    assert len(pixel_checks) >= 3, 'clean, transparent and offline exports were independently decoded'
except (AssertionError, OSError, ValueError) as error:
    result['result'] = 'failed'
    result['pixel_error'] = str(error)
    result['pixel_checks'] = pixel_checks
    (artifacts/'verification-failed.json').write_text(json.dumps(result, indent=2)+'\n')
    raise SystemExit(str(error))
result['pixel_checks'] = pixel_checks
result['checks'].append('Independent downloaded PNG pixel, opacity, dimensions and chunk verification passes')
(artifacts/'verification.json').write_text(json.dumps(result, indent=2)+'\n')
(artifacts/'verification-failed.json').unlink(missing_ok=True)
print(json.dumps({'result':result['result'],'checks':len(result['checks']),'fixtures':[{k:f[k] for k in ['fixture','true_positives','false_positives','false_negatives','precision','recall','wall_ms']} for f in result['fixtures']], 'pixel_exports':len(pixel_checks), 'artifact':str(artifacts/'verification.json')},indent=2))
PY
