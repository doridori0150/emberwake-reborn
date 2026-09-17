"""assets/generated/(이미지 생성 원본, git 제외) → assets/town/*.webp (게임용 크기).
여백을 잘라 내고 줄인다. 픽셀아트라 최근접(NEAREST)이 아니라 BOX 로 줄인 뒤 알파를 또렷하게 한다.
사용법: python tools/process-generated.py   (Pillow 필요. 게임 실행에는 필요 없다)"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DST = os.path.join(ROOT, 'assets', 'generated'), os.path.join(ROOT, 'assets', 'town')
# 이름 접두사 → (긴 변 목표 크기, 여백 자르기, 불투명 타일 여부)
RULES = [('portrait_', 512, False, False), ('npc_', 160, True, False), ('tree_', 288, True, False), ('bush', 120, True, False),
         ('tile_', 128, False, True), ('shop_counter', 224, True, False), ('shop_shelf', 200, True, False), ('icon_', 128, True, False)]

def crisp_alpha(im):
    r, g, b, a = im.split()
    return Image.merge('RGBA', (r, g, b, a.point(lambda v: 0 if v < 96 else 255)))

def main():
    os.makedirs(DST, exist_ok=True)
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.png'):
            continue
        rule = next((r for r in RULES if name.startswith(r[0])), None)
        if not rule:
            continue
        _, size, trim, opaque = rule
        im = Image.open(os.path.join(SRC, name)).convert('RGBA')
        if opaque:  # 잔디 타일: 가장자리의 반투명을 없애고 가운데를 잘라 쓴다
            w, h = im.size
            im = im.crop((w // 8, h // 8, w - w // 8, h - h // 8))
            bg = Image.new('RGBA', im.size, (58, 86, 51, 255)); bg.alpha_composite(im); im = bg
        elif trim:
            box = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            if box:
                im = im.crop(box)
        k = size / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.BOX)
        if not opaque:
            im = crisp_alpha(im)
        out = os.path.join(DST, name[:-4] + '.webp')
        im.save(out, 'WEBP', lossless=True, method=6)
        print(name, '->', os.path.relpath(out, ROOT), im.size, os.path.getsize(out) // 1024, 'KB')

if __name__ == '__main__':
    main()
