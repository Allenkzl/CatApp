# 云端绘图改为小体积 Base64 参考图

## 背景

2026-10-30 先尝试了“公网 URL 参考图”：请求体 5066 字节、`referenceMode:url`，方舟在 12.6 秒后返回 HTTP 400 `InvalidParameter`，没有生成图片。模型和密钥已先通过无效模型探测（310 毫秒返回 404），因此失败点在方舟拉取那 9 个公网 URL（拉取失败或拉取超时），不是鉴权或模型。

随后改为小体积 Base64：不再让方舟拉图，也不再发送 12.4MB 的原始请求。

## 改动

- 风格图改用 `public/comic-style-reference-en.jpg`（1024px，约 262KB），不再发送 2.6MB PNG。
- 参考照片只选 **2 张**（在面板来源中按时间均匀抽取），以 JPEG Base64 内嵌；请求约 2.5MB，而不是 12.4MB。
- `response_format=url`，回包小于 1KB；拿到 URL 后先写 `jobs/<workId>/seedream-result.url`，再下载 PNG；下载失败重试复用该 URL（23 小时内），不重复付费。
- 日汇总 `size` 为 `1152x1536`，PNG 约 3–4MB；旧批次仍为 `2560x1440`。
- 图片下载走原生 HTTPS：600 秒、最多 2 次 HTTPS 重定向、24MiB 上限。
- `SEEDREAM_REFERENCE_LIMIT` 可调整参考照片数量（0–10，默认 2）；0 表示只发风格图。

## 为什么不是 URL 参考图

URL 参考图能把请求降到 5KB，但方舟必须能从公网拉取照片。本次实测被 400 拒绝，最可能是拉取失败/超时（9 张合计约 6.9MB）。小体积 Base64 不依赖公网可达性，只依赖已知可用的上传通道；2.5MB 在 600 秒内按 10KB/s 也能传完。

## 核验

- 部署后 `/healthz` 应含 `seedreamSmallReferenceVersion:1`。
- `/api/capture` 的 `automation.drawingReferenceMode` 应为 `base64-limited`。
- 点击绘图后诊断应显示 `requestBytes` 约 2.5MB、`referenceMode:"base64-limited"`；成功后先 `downloading_image`，再 `saving_image`/`completed`。
- 76 项后端测试及手动绘图浏览器验证通过；未发起真实付费调用。2 张参考图会降低猫的外观一致性，这是为当前慢链路做的取舍。
