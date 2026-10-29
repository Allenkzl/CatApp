# Seedream 长等待修复

## 问题与修改

2026-10-29真实复现于303145ms报UND_ERR_HEADERS_TIMEOUT。外层AbortSignal600000ms无法覆盖fetch/Undici默认约300秒的响应头等待限制。

Seedream专用传输改为Node原生HTTP(S)请求，不新增运行依赖。实际生产地址仍固定官方Ark HTTPS接口，正常验证TLS。一个600秒AbortSignal覆盖连接、上传、等待响应头和接收响应体全过程，不自动重试、不跟随重定向；明确发送Content-Length，响应最多40MiB。DeepSeek沿用原fetch，故事整理逻辑不变。

继续保留手动费用确认、幂等请求ID、一次执行、失败不自动重试、诊断阶段及服务商请求ID，付费PNG先缓存再发布。

## 验证方法

- 后端网络测试检查：生产默认确实选中原生传输、响应头慢返回、头前超时、收到头后正文超时、HTTP错误、JSON异常、连接中断、响应大小限制、重定向不转发凭据、没有自动重试。
- `npm run verify:drawing-wait`：只在127.0.0.1启动模拟绘图接口，默认故意等待310秒后才返回PNG。完整经过手动排队、绘图传输、缓存、发布；验证只发一次请求、保存和作品完成。无任何真实付费模型调用。可用CAT_DRAWING_TEST_DELAY_MS缩短快速检查，但不能把缩短测试当成超过300秒的验证。
- `npm run check`、`npm test`、`npm run verify:manual`、`npm run verify:server`。

## 部署核验与用户重测

合并/推送后需确认公开`/healthz`含`drawingTransportVersion:1`，`/api/capture`中`automation.drawingTransport:node-https`、`drawingTimeoutSeconds:600`，才能认为线上已使用修复传输。推送不等于部署。

用户在网站中打开已保存英文故事，点击“重新绘图（付费）”，确认后观察阶段。成功会自动展示并可下载PNG；如果新请求仍失败，读取绘图诊断的阶段/错误码/请求ID。修复等待时间不能保证服务商一定在600秒内返回，也不保证模型绘图质量。此前超时是否计费需以方舟记录为准。

## 本轮验证结果

71项后端测试通过，手动绘图/只读诊断及服务器浏览器回归通过；310秒慢响应完整模拟成功保存PNG并发布作品，全程一次请求，无自动重试。原生HTTPS对官方Ark进行无密钥HEAD检查，完成TLS并返回401（仅连通性检查，未调用模型）。本轮没有真实付费绘图调用。

## 正式站核验

2026-10-29 main发布ced8b10已推送，GitHub交付Jenkins HTTP200；正式站health返回drawingTransportVersion=1，automation和只读诊断均为node-https/600秒。频率仍daily、绘图manual、worker空闲；此前失败作品保留、drawingAttempts仍2。本轮未新增真实付费绘图，交由用户点击网站重测。此验收记录本地提交，不为文档再次触发部署。
