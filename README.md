# 沪教版五年级上册英语点读（2026新版）

适用于《义务教育教科书（五·四学制）·英语 五年级上册》，Unit 1 为 **Clubs in our school**。

## 当前功能

- Starter + Unit 1–10 教材内容
- 74 个出版社配套原版音轨合并为在线 `audio-sprite.ogg`
- **不使用浏览器 TTS / 合成语音**
- Starter · At school：22 个人工精校逐句点读段
- Starter · Study skills + Unit 1–10 Talking time、Story/Reading time：v3 显式时间轴，共 179 个精校语义段
- 主课文合计 **201 个原版点读段**
- v3 每个点读段直接保存“教材原文 + 起始时间 + 结束时间”，不再依赖网页标点自动推算
- 播放边界采用 `requestAnimationFrame + timeupdate` 双重监控，减少句尾串入下一句
- 支持上一句、重播、下一句、播放速度、逐句循环、全文搜索
- iPad / 手机 / 电脑自适应

## 关键文件

- `index.html` / `app.js` / `styles.css`：点读网页
- `data/index.json`、`data/units/`：教材结构化内容
- `data/audio-sprite-manifest.json`：74 条原版音轨在总音频中的绝对位置
- `data/point-v3/`：按 Starter / Unit 1–10 拆分的主课文 v3 精校点读时间轴
- `assets/audio-sprite.ogg`：出版社原版录音的网页音频集合

## 在线版

GitHub Pages：`https://jayceeli.github.io/hujiao-grade5-english/`

> 教材及配套音频仅用于个人学习。
