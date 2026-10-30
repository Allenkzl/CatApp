# 云端绘图改为公网 URL 参考图

## 原因

2026-10-30 实测：云容器到方舟的小请求正常（60KB 响应体约 0.7 秒），但 12.4MB 上行 600 秒未完成、约 11MB 回包 180 秒未完成；同一容器到 DeepSeek 的约 6.5MB 上行正常。问题限定在容器到方舟的多 MB 传输，而不是密钥、模型或超时设置。

## 改动

- 生产 `CAT_PUBLIC_URL` 为 `https://` 时，Seedream 的 `image` 改为公网 URL：风格图 `/public/comic-style-reference-en.jpg`（1024px JPEG，约 262KB）加上来源照片 `/api/capture/photos/<id>.jpg`。请求体积从约 12.4MB 降到约 5KB（不含方舟自行拉取的图片）。
- `response_format` 改为 `url`，回包约 1KB；拿到 `data[0].url` 后先写入 `jobs/<workId>/seedream-result.url`，再下载 PNG。下载失败或进程中断后重试可复用该 URL（23 小时内），不重复调用付费模型。
- 日汇总的 `size` 改为 `1152x1536`，PNG 从约 8.4MB 降到约 3–4MB；旧批次仍为 `2560x1440`。
- 图片下载仍走原生 HTTPS：600 秒、最多 2 次 HTTPS 重定向、24MiB 上限；不使用 fetch 的 300 秒默认限制。
- 非 https 的 `CAT_PUBLIC_URL`（如局域网 http）继续使用原来的 base64 请求，避免本地测试和旧环境被误改。

## 前置条件

- `CAT_PUBLIC_URL=https://<公网域名>`，且站点照片免登录可访问（当前 `CAT_REQUIRE_LOGIN=false`）。
- 方舟能从公网拉取该域名；若被 Cloudflare 或网络策略拦截，请求会失败。
- 风格图 JPEG 必须随镜像发布；目录为 `public/`。

## 核验

- 部署后 `/healthz` 应含 `seedreamUrlReferenceVersion:1`。
- `/api/capture` 的 `automation.drawingReferenceMode` 应为 `url`；若仍是 `base64`，说明运行时 `CAT_PUBLIC_URL` 不是 https 或未配置，改动未生效。
- 用户点击网站“生成漫画（付费）”后观察：请求日志应为 `referenceMode:"url"`、`requestBytes` 约 5KB；成功后先出现 `downloading_image`，再 `saving_image`/`completed`。
- 失败时只读诊断应保留阶段、耗时、HTTP 状态、请求 ID 和允许列表错误码，不记录原始响应、URL 凭据或密钥。

## 验证边界

76 项后端测试、`npm run verify:manual` 和短延时传输模拟通过；310 秒完整模拟为改动前结果，本次未重跑。新增测试覆盖 URL 请求体、回包下载、失败后复用 URL 不重复付费。未发起真实付费调用；方舟实际拉图、最终图片大小与画质、Cloudflare 可达性需用户在正式站测试确认。
