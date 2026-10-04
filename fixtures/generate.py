#!/usr/bin/env python3
"""Render fictional fixtures and independent glyph ground truth before OCR.

Reproduce with: uv run --no-project --with pillow==12.1.1 python fixtures/generate.py
No OCR dependency or recognition output is used to choose text or boxes.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin, __version__

ROOT = Path(__file__).resolve().parent
FONT = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
BOLD = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
manifest = {
    'fictional': True,
    'ground_truth_method': 'Rendered alpha glyph bounds from independently authored text; written before any OCR run.',
    'generator': 'fixtures/generate.py',
    'pillow_version': __version__,
    'fonts': [{'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [FONT, BOLD]],
    'fixtures': [],
}


def render(name, lines, contacts, size=(1120, 680), transparent=False, note=None, non_sensitive_lines=()):
    image = Image.new('RGBA', size, (255, 255, 255, 0 if transparent else 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 24, size[0]-24, size[1]-24), radius=18, fill='#ffffff', outline='#cbd5e1', width=2)
    draw.rounded_rectangle((24, 24, size[0]-24, 128), radius=18, fill='#e8f1f8')
    regions = []
    harmless = []
    for index, line in enumerate(lines):
        text, x, y, font_size, color, bold = line
        font = ImageFont.truetype(str(BOLD if bold else FONT), font_size)
        glyph = Image.new('L', size, 0)
        ImageDraw.Draw(glyph).text((x, y), text, font=font, fill=255)
        bbox = glyph.getbbox()
        draw.text((x, y), text, font=font, fill=color)
        if index in contacts:
            kind, group = contacts[index]
            regions.append({'type': kind, 'group': group, 'text': text, 'bbox': {'x': bbox[0], 'y': bbox[1], 'width': bbox[2]-bbox[0], 'height': bbox[3]-bbox[1]}, 'font_size': font_size})
        if index in non_sensitive_lines:
            harmless.append({'text': text, 'bbox': {'x': bbox[0], 'y': bbox[1], 'width': bbox[2]-bbox[0], 'height': bbox[3]-bbox[1]}})
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Comment', 'Fictional verification source only; this metadata must not survive export.')
    target = ROOT / name
    image.save(target, pnginfo=metadata)
    manifest['fixtures'].append({'file': name, 'width': size[0], 'height': size[1], 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'transparent_source': transparent, 'note': note, 'contacts': regions, 'non_sensitive_regions': harmless})


render('help.png', [
    ('FICTIONAL SUPPORT CHAT', 54, 49, 29, '#16364b', True),
    ('Demo data - no real person or account', 54, 94, 21, '#405467', False),
    ('Please remove my contact details before sharing.', 54, 176, 28, '#172b40', False),
    ('Email: alex.river@example.com', 54, 251, 32, '#152c40', False),
    ('Phone: +1 (202) 555-0147', 54, 327, 32, '#152c40', False),
    ('Badge code: 314159', 54, 411, 28, '#172b40', False),
    ('Message: The classroom projector needs a new cable.', 54, 478, 25, '#172b40', False),
    ('Manually review names, addresses, faces and QR codes too.', 54, 565, 22, '#405467', False),
], {3: ('email', 'email'), 4: ('phone', 'phone')}, note='Clean contact lines. Badge code is deliberately outside supported detection patterns.', non_sensitive_lines=(5,))

render('split.png', [
    ('FICTIONAL SPLIT MESSAGE', 54, 49, 29, '#16364b', True),
    ('Hard fixture: contact details split across lines', 54, 94, 21, '#405467', False),
    ('Please contact:', 54, 174, 26, '#172b40', False),
    ('casey.fern@', 54, 237, 29, '#172b40', False),
    ('example.com', 54, 286, 29, '#172b40', False),
    ('+1 (202)', 54, 372, 29, '#172b40', False),
    ('555-0182', 54, 421, 29, '#172b40', False),
    ('A visual review must cover both halves of each contact.', 54, 548, 23, '#405467', False),
], {3: ('email', 'email'), 4: ('email', 'email'), 5: ('phone', 'phone'), 6: ('phone', 'phone')}, note='Two independently known contacts with fragmented glyph regions; score a contact only if every fragment is covered by suggestions.')

render('faint.png', [
    ('FICTIONAL LOW-CONTRAST MESSAGE', 54, 49, 26, '#16364b', True),
    ('Hard fixture: faint and smaller contact details', 54, 94, 21, '#405467', False),
    ('Faint email: jordan.moss@example.com', 54, 218, 16, '#c3c8cc', False),
    ('Faint phone: +1 (202) 555-0196', 54, 276, 16, '#c3c8cc', False),
    ('Ticket reference: 9876543210', 54, 376, 25, '#172b40', False),
    ('A numeric ticket can be a pattern false positive.', 54, 439, 23, '#405467', False),
    ('Transparency around this card must export as opaque white.', 54, 548, 22, '#405467', False),
], {2: ('email', 'email'), 3: ('phone', 'phone')}, transparent=True, note='Contains a harmless ten-digit ticket reference as a potential false positive; source outside card is transparent.', non_sensitive_lines=(4,))

(ROOT / 'ground-truth.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'fixtures': [f['file'] for f in manifest['fixtures']], 'pillow': __version__}))
