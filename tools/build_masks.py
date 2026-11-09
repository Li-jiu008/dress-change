"""
build_masks.py — 为光影遮罩生成“剪影数据”

为什么需要这个：
  file:// 下浏览器会拦截「用本地图片当 CSS 遮罩」，但允许 data: 开头的遮罩。
  所以把每张图缩小成 140px 宽的透明剪影，转成 data URL 内联进 js/masks.js。

什么时候要重跑：
  往 assets/ 里加了新的 PNG 之后，重新执行一次本脚本，
  新素材才有光影；没跑也不会报错，只是那几件不受光。

用法：
  python tools/build_masks.py
"""
import base64
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "js", "masks.js")
MAX_W = 140


def build():
    data = {}
    for dirpath, _dirnames, filenames in os.walk(ASSETS):
        for name in filenames:
            if not name.lower().endswith(".png"):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            try:
                with Image.open(full) as im:
                    im = im.convert("RGBA")
                    if im.width == 0 or im.height == 0:
                        continue
                    w = min(im.width, MAX_W)
                    h = max(1, round(im.height * w / im.width))
                    small = im.resize((w, h), Image.LANCZOS)

                    # 只保留 alpha，RGB 全部压黑（遮罩按 alpha 取形状）
                    alpha = small.getchannel("A")
                    mask = Image.new("RGBA", small.size, (0, 0, 0, 0))
                    mask.putalpha(alpha)

                    buf = os.path.join(os.environ.get("TEMP", ROOT), "_mask_tmp.png")
                    mask.save(buf, "PNG", optimize=True)
                    with open(buf, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("ascii")
                    os.remove(buf)
                    data[rel] = "data:image/png;base64," + b64
            except Exception as e:  # noqa: BLE001
                print("skip", rel, e)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 自动生成：光影遮罩剪影（跑 tools/build_masks.py 重新生成） */\n")
        f.write("window.CHAR_MASKS = ")
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    print("生成 %d 个剪影 -> %s (%.1f KB)" % (
        len(data), OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    build()
