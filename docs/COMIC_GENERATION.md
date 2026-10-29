> 2026-10-29：本文保留历史接入记录。当前自动任务只生成英文故事，Seedream 需在故事内手动确认后付费绘图；新流程和状态见 [MANUAL_DRAWING.md](MANUAL_DRAWING.md)。

> 当前分支已升级为按天总结，操作与迁移请先阅读 [每日总结说明](DAILY_SUMMARY.md)。下文每N张组图为历史版本说明。

# 自动收图与英文故事

本轮范围：SSH 持续下载 → 观测记录 → 可配置数量分组 → DeepSeek 英文故事 → Seedream 英文漫画 → 作品库。绘图需要火山方舟账户开通对应 Seedream 模型；失败保留原图和故事。

## 手机测试

1. 打开 http://localhost:4173/#settings 。每篇照片数默认 3，可设置 1–12。正在收集的一组保留原目标，新设置用于下一组。
2. 填写 DeepSeek 密钥并保存。密码框不回显，后端不返回密钥。密钥保存于忽略的 `.data/secrets.json`，权限 0600。
3. 在“摄像头 SSH 连接”填写设备地址、SSH 账户（本设备为 root）、密码，点击“保存并启动持续采集”。主机 SSH 指纹需已经信任；本机密码传输使用现有 sshpass，或留空使用已配置的 SSH 密钥。
4. 摄像头状态应更新为在线，状态 `waiting_for_cat` / `watching`。目录可读不等于摄像头在线。
5. 手机展示猫咪动作：每次下载后移开至少 2 秒，再展示下一张；最少间隔 5 秒。猫一直在画面内时每 30 秒补拍一张。猫检测不代表身份或动作已被确认。
6. 观测记录会逐张更新，收齐 N 张自动进入作品库并调用 DeepSeek。完成后可查看全英文标题、简介、分镜对白、观察依据与不确定性。
7. 在自动漫画设置中保存 Ark API Key 和已开通的 Seedream 模型 ID。本机已配置用户开通的 `doubao-seedream-5-0-flash-260915`（代码缺省为 Pro）；也支持 `ep-...` 推理接入点。后台自动给待绘图故事生成 PNG，成功后作品库显示图片和下载按钮。未开通模型返回 `ModelNotOpen`，需在控制台开通后点“仅重试绘图”。

电脑和本地 Node 服务必须保持运行；关闭浏览器不影响采集和故事队列。系统重启后需要运行 `npm run dev`，不是已安装的系统开机服务。配置为启用时，本地服务启动会恢复采集。空间设置可停止采集。采集程序不改 GPIO、模型或原 reCamera 项目源码。

## 持续采集

- 实现位于 `scripts/recamera/`，基于原独立猫观察采集器适配；保留原相机 API、检测阈值、JPEG 校验、SSH 流式下载、原子清单与断点恢复。
- 设备新增 `/userdata/recamera-cat-observation/camera_collect_continuous.py`，不覆盖旧 `camera_collect.py`；共用设备锁，避免和旧猫观察采集器同时占用端点。
- 通过官网相机本地 HTTPS / websocket 接口检测猫（默认阈值 0.3）。只有明确检测帧能判断猫离开，网络断开不会重新触发一次出现。
- 下载目录仍是 `~/Desktop/reCamera猫观察/cats-*/`，写入 `photos.json` / `status.json` 后网站导入。
- `.data/collector-session.json` 保存续传批次；`.data/collector-config.json` 保存私有连接配置（0600）。登录或启动失败不会无限重复认证，修正后手动重新启动。
- 设备端每 5 秒检测流活动心跳；网页超过 15 秒未收到有效在线状态时显示离线。无检测流不当作在线。
- 原始照片与清单不自动删除。两端需要监测磁盘容量；设备剩余空间低于 200 MB 时拒绝拍照。当前单批次清单有 2 MB 防护上限，长期运行需增加轮转与保留策略。

可通过环境变量预置（密码不要写进命令历史）：

```bash
CAT_CAMERA_HOST=192.168.50.94 CAT_CAMERA_USER=reCamera npm run dev
```

其他环境变量：`CAT_CAPTURE_DIR`、`CAT_DATA_DIR`、`CAT_CAMERA_ID`、`CAT_CAPTURE_INTERVAL`（默认 30 秒）、`CAT_PYTHON`。独立 CLI 可运行 `python3 scripts/recamera/collect_to_desktop.py --help`。

## 组图与任务

- 默认摄像头 ID 为 `recamera-default`，按摄像头 ID + 北京日期分组，允许同一摄像头不同下载会话合组；不跨日期或摄像头。
- 文件 ID 仍按采集会话 + 文件名生成，重扫不会重复导入；源文件必须视为不可变。
- 旧照片排版作品迁移为待生成，原图和旧 SVG 路径保留。已发布的英文手绘 PNG 保留版本。
- 状态：`ready_for_generation → generating → awaiting_image_provider → drawing → completed`。绘图失败为 `image_failed`。临时 HTTP 429 / 5xx 最多尝试 3 次并持久化退避时间；认证、数据格式或超时失败需手动重试。
- 生成中服务重启会标为失败，要求手动重试，避免在不知道请求是否计费的情况下自动重复调用。每个服务只运行一个故事任务；收图独立进行。
- 官方端点 `https://api.deepseek.com/chat/completions`，模型 `deepseek-flash`。照片以 base64 输入，返回严格校验的英文 JSON；不记录供应商原始错误响应或密钥。未配置密钥时保留等待队列。绘图调用固定官方 `https://ark.cn-beijing.volces.com/api/v3/images/generations`；密钥存 `.data/seedream-config.json`（0600），不返回浏览器。
- 故事为虚构创作。身份、时长、连续行为不能从独立抓拍确认。手机模拟素材中的人、办公室、手机和检测框不能成为漫画场景模板。

## 后续手绘回填

视觉参考为 `public/comic-style-reference-en.png`：暖色水彩/水粉、奶油纸底、棕色圆角边框、大字英文气泡与短句。根据新照片动作创作，不套用示例动作。照片数与分镜数分开：N 张照片可提炼成 1–6 格。

`server/seedream.mjs` 根据英文分镜生成单张2560×1440横向PNG，风格图为第一张输入，其他输入为分镜引用的实际照片。自动结果标记 `generationMode: seedream-api`、`reviewed: false`、`qualityStatus: unreviewed`；不把格式/英文JSON校验当作图中文字审核。API错误、超时或服务重启都不自动重复绘图计费。付费输出先写 `.data/jobs/WORK_ID/seedream-result.png` 和 `seedream-publication.json`，发布失败后重试复用已保存结果。

当前也可由对话协助生成、看图审核后回填。默认本机 4173：

```bash
node scripts/comic-jobs.mjs pending
node scripts/comic-jobs.mjs prepare --id WORK_ID
node scripts/comic-jobs.mjs publish --id WORK_ID --image /absolute/path/result.png --metadata /absolute/path/publication.json
```

元数据包含 `title`、`summary`、`language: en`、准确原顺序 `photoIds`、1–6 项 `panels`（`photoId/caption/dialogue/observation/uncertainty`）、实际 `prompt`、`reviewed: true`、`storyIsFiction: true`、`continuousEventVerified: false`。英文和来源校验不能代替实际看图审核。

## 验证与当前限制

- `npm run check` / `npm test` / `npm run test:camera`。
- `node scripts/verify-auto.mjs` 用临时目录和现有 Chrome 测试 UI，不污染用户数据。
- 已完成真实 DeepSeek 看图故事调用，包含新一轮手机模拟的三张抓拍；持续收图的程序逻辑和目录业务链路已测试，已使用 root 账户登录设备并启动持续采集，在线心跳已验证；已收到本轮3张手机模拟抓拍并自动生成第二篇故事。初始 Pro 请求返回 HTTP404 `ModelNotOpen`；用户随后开通 Flash，切换 `doubao-seedream-5-0-flash-260915` 后两篇真实绘图均已成功，2560×1440 PNG 已自动入库。已逐张查看英文、三格顺序和参考画风；自动结果仍保留 `reviewed: false`，供用户确认。
- 备份整个 `.data/`；其中含私有密钥和密码，勿分享或加入 Git。每个数据目录只能有一个服务进程。
