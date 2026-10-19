"""
用标签展开图（印刷稿，成品 206.5×160mm，左右各 2.5mm 焊接）替换 can.png 里的罐身标签部分；瓶盖 / 罐肩 / 罐底保持原样
  横向：两条蓝色焊接线之间 = 罐身一整圈，焊缝在背面，Logo 正好朝正面（u = 0.5）
  纵向：上下两条绿色虚线之间（设计师标的露出区）铺满罐身金色带上沿 ~ 标签下沿（比真实比例纵向拉长约 4%，看不出）
  取图时往里收几个像素，避开虚线和"9mm/12mm"标注
用法：python3 tools/make_label.py <标签展开图.jpg> <原 can.png> <输出 can.png>
坐标都是印刷稿整图（4761×2982）里的像素，换稿要重新量
"""
import sys
import numpy as np
from PIL import Image

ART, BASE, OUT = sys.argv[1:4]
WELD_L, WELD_R = 338, 2723      # 左右蓝色焊接线 → 一整圈
SHOW_TOP, SHOW_BOT = 942, 2585  # 上下绿色虚线：露出区
INSET = 5                       # 往里收，避开虚线本身
TEX_TOP, TEX_BOT = 633, 2094    # can.png 里罐身金色带上沿 / 标签下沿所在行
PX_MM_ART = 11.81               # 印刷稿 每毫米像素
CIRC_MM = (WELD_R - WELD_L) / PX_MM_ART

base = Image.open(BASE).convert('RGB')
W, H = base.size
rows = TEX_BOT - TEX_TOP
art = Image.open(ART).convert('RGB').crop((WELD_L + INSET, SHOW_TOP + INSET, WELD_R - INSET, SHOW_BOT - INSET))
label = art.resize((W, rows), Image.LANCZOS)
out = base.copy()
out.paste(label, (0, TEX_TOP))
out.save(OUT, optimize=True)
stretch = rows / (W / CIRC_MM) / ((SHOW_BOT - SHOW_TOP) / PX_MM_ART)
print(f'一圈 {CIRC_MM:.1f}mm，露出区 {(SHOW_BOT - SHOW_TOP) / PX_MM_ART:.1f}mm，纵向比例 ×{stretch:.3f} → {OUT}')
