#!/usr/bin/env bash
set -euo pipefail
umask 077
# Playwright session/config orchestration pattern reused from Shiftproof.
# Caption composition and all Scrim actions are new; product sources stay frozen.
scrim_source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$scrim_source"
scrim_artifacts=/home/dylan/services/scrim/artifacts
install -d -m 700 "$scrim_artifacts"
scrim_config=$(mktemp)
cleanup() {
  rm -f "$scrim_config"
  playwright-cli -s=scrim-demo close >/dev/null 2>&1 || true
}
trap cleanup EXIT
python3 - "$scrim_config" <<'PY'
import json, sys
from pathlib import Path
browsers=sorted((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux64/chrome'),key=lambda p:int(p.parents[1].name.split('-')[1]),reverse=True)
if not browsers: raise SystemExit('Install Playwright Chromium first.')
Path(sys.argv[1]).write_text(json.dumps({'browser':{'browserName':'chromium','isolated':True,'launchOptions':{'executablePath':str(browsers[0]),'headless':True},'contextOptions':{'viewport':{'width':1280,'height':900},'reducedMotion':'reduce','acceptDownloads':True}}}))
PY
playwright-cli -s=scrim-demo open http://127.0.0.1:8212/ --config="$scrim_config" > "$scrim_artifacts/demo-open.log"
playwright-cli -s=scrim-demo video-start "$scrim_artifacts/demo-raw.webm" --size=1280x900 --fps=20 > "$scrim_artifacts/demo-recording.log"
playwright-cli -s=scrim-demo run-code --filename=demo.js > "$scrim_artifacts/demo-browser.log"
playwright-cli -s=scrim-demo video-stop >> "$scrim_artifacts/demo-recording.log"
uv run --no-project --with pillow==12.1.1 --with imageio-ffmpeg==0.6.0 python - "$scrim_artifacts" "$scrim_source" <<'PY'
import hashlib, json, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

artifacts, source=map(Path,sys.argv[1:])
raw=(artifacts/'demo-browser.log').read_text()
if '### Result' not in raw: raise SystemExit('No browser proof returned; inspect demo-browser.log.')
proof,_=json.JSONDecoder().raw_decode(raw.split('### Result',1)[1].lstrip())
if proof.get('result')!='completed' or proof['errors'] or proof['external_requests']:
    raise SystemExit('Walkthrough did not complete cleanly; inspect browser proof.')
if not 60 <= proof['workflow_duration_seconds'] <= 100: raise SystemExit('Walkthrough must be60–100seconds.')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def media_duration(path):
    metadata=subprocess.run([ffmpeg,'-hide_banner','-i',str(path)],capture_output=True,text=True).stderr
    match=re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',metadata)
    if not match: raise SystemExit('Cannot read recording duration.')
    h,m,s=map(float,match.groups())
    return h*3600+m*60+s,metadata
duration,_=media_duration(artifacts/'demo-raw.webm')
# CLI capture starts immediately; any excess duration is a final frame hold.
# Keep captions aligned with actual action times, rather than shifting them.
lead=0
captions=artifacts/'demo-captions'
captions.mkdir(exist_ok=True)
title_font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',24)
detail_font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
foot_font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
scenes=proof['scenes']
frames=[]
for i,scene in enumerate(scenes):
    image=Image.new('RGB',(1280,130),'#29283d'); draw=ImageDraw.Draw(image)
    draw.rectangle((0,0,1280,3),fill='#9186cc')
    draw.text((32,18),scene['title'],font=title_font,fill='#ffffff')
    detail=scene['detail']
    if draw.textlength(detail,font=detail_font)>1216: raise SystemExit('Caption detail exceeds the readable band.')
    draw.text((32,58),detail,font=detail_font,fill='#e1dced')
    draw.text((32,100),'SCRIM / RECORDED WALKTHROUGH / FICTIONAL EXAMPLE / ACTUAL LOCAL OCR',font=foot_font,fill='#b8afd3')
    frame=captions/f'{i:02d}.png'; image.save(frame); frames.append(frame)
manifest=[]
for i,frame in enumerate(frames):
    start=0 if i==0 else scenes[i]['start_seconds']+lead
    end=scenes[i+1]['start_seconds']+lead if i+1<len(scenes) else duration
    manifest.extend([f"file '{frame}'",f'duration {max(0.05,end-start):.6f}'])
manifest.append(f"file '{frames[-1]}'")
(captions/'timeline.ffconcat').write_text('\n'.join(manifest)+'\n')
with (artifacts/'demo-encode.log').open('w') as log:
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','warning','-f','concat','-safe','0','-i',str(captions/'timeline.ffconcat'),'-t',str(duration),'-vf','fps=20','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-b:v','0','-crf','30','-pix_fmt','yuv420p',str(captions/'captions.webm')],stdout=log,stderr=log,check=True)
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','warning','-i',str(artifacts/'demo-raw.webm'),'-i',str(captions/'captions.webm'),'-filter_complex','[0:v]pad=iw:ih+130:0:0:color=0x29283d[padded];[padded][1:v]overlay=0:main_h-overlay_h:shortest=1[out]','-map','[out]','-an','-t',str(duration),'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-row-mt','1','-b:v','0','-crf','28','-pix_fmt','yuv420p',str(artifacts/'demo.webm')],stdout=log,stderr=log,check=True)
final_duration,metadata=media_duration(artifacts/'demo.webm')
if not 60<=final_duration<=100: raise SystemExit('Final duration is outside60–100seconds.')
proof['duration_seconds']=final_duration
proof['caption_method']='Caption PNG panels rendered with Pillow and composed below the unchanged browser screen using ffmpeg. No playback speed changes.'
proof['encoding_tool']='imageio-ffmpeg0.6.0 / bundled ffmpeg7.0.2; Pillow12.1.1; local DejaVu fonts'
proof['video']={'file':'demo.webm','sha256':hashlib.sha256((artifacts/'demo.webm').read_bytes()).hexdigest(),'bytes':(artifacts/'demo.webm').stat().st_size,'width':1280,'height':1030}
proof['download']['sha256']=hashlib.sha256((artifacts/'demo-export.png').read_bytes()).hexdigest()
proof['download']['bytes']=(artifacts/'demo-export.png').stat().st_size
(artifacts/'demo.json').write_text(json.dumps(proof,indent=2)+'\n')
(source/'demo.webm').write_bytes((artifacts/'demo.webm').read_bytes())
(source/'demo.webm').chmod(0o644)
print(json.dumps({'result':proof['result'],'duration_seconds':final_duration,'video':str(artifacts/'demo.webm'),'proof':str(artifacts/'demo.json'),'scan_wall_ms':proof['scan_wall_ms'],'export_wall_ms':proof['export_wall_ms'],'download':proof['download']},indent=2))
PY
