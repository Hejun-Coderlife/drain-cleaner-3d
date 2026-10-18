# HYPER CLEAN 管道疏通泡沫 · 3D 原理演示

Three.js 单页（index.html + app.js），无构建步骤，格式同 hymn-store-3d。

- 本地预览需要起服务器（ES module）：`python3 -m http.server 8901`，打开 http://localhost:8901
- 点罐子 / ▶ 播放约 20 秒演示：扭 OPEN → 摇匀 → 倒扣按压 → 泡沫灌满存水弯、顺溢水通道从侧面小口挤出 → 静置 30 分钟 → 冲水 → 洁净
- 场景：剖开的椭圆台盆 + 大理石台面 + 镀铬龙头；P 形存水弯穿后墙；溢水口背后的溢水通道用"透视"画法
- 罐子（6.5 × 22 cm）的轮廓和贴图都取自产品正面图：
  `python3 tools/make_can.py <产品图.png> can.png` 生成展开贴图 `can.png`，并打印 `CAN_PROFILE` 贴进 app.js
  （label.js 是早期按视频手绘的示意稿，已不再使用）
- 尺寸在 `app.js` 顶部 `DIM` / `TRAP`，时间轴在 `TL`
- URL 参数：`?t=秒` 定格、`?v=full|product|basin|pipe|ovf` 机位、`?cp=x,y,z&ct=x,y,z` 自定机位、`?ui=0` 无界面、`?play=1` 自动播放
- 「H」收起界面、「F」全屏、空格播放/暂停；`window.DRAIN` 暴露场景便于调试
