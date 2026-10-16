# HYPER CLEAN 管道疏通泡沫 · 3D 原理演示

Three.js 单页（index.html + app.js + label.js），无构建步骤，格式同 hymn-store-3d。

- 本地预览需要起服务器（ES module）：`python3 -m http.server 8901`，打开 http://localhost:8901
- 点罐子 / ▶ 播放 18 秒演示：扭 OPEN → 摇匀 → 倒扣按压 → 泡沫灌满存水弯 → 静置 30 分钟 → 冲水 → 洁净
- 尺寸在 `app.js` 顶部 `DIM`（罐子按视频反推：直径 65mm、罐身 151mm、总高约 225mm），时间轴在 `TL`
- **罐身标签是按视频截图重画的示意稿**（label.js）。拿到真实设计稿后，把展开图存成 `label.png`
  （宽:高 ≈ 1.41:1，画面正中 = 罐子正面）放进本目录即可自动替换
- URL 参数：`?t=秒` 定格、`?v=full|product|basin|pipe` 机位、`?ui=0` 无界面、`?play=1` 自动播放
- 「H」收起界面、「F」全屏、空格播放/暂停；`window.DRAIN` 暴露场景便于调试
