# 阳台猫观察室 CatApp

## 项目简介
Open Datalogger 阳台猫工作台。支持本地目录/SSH模式及服务器HTTP直传模式；按可配置张数组图，DeepSeek生成英文故事，Seedream生成手绘漫画并入库。

## 技术栈
- 原生 HTML、CSS、JavaScript ES Modules，无第三方运行依赖。
- Node.js 22 HTTP 服务，本地/服务器双模式，无第三方运行依赖；抓拍和每日漫画保存在 `.data/`。
- 浏览器 localStorage/IndexedDB 继续保存旧版模拟数据和原型素材。

## 目录结构
- `index.html`、`src/`：页面、样式与业务交互。
- `public/`：本地演示素材。
- `scripts/`：本地启动与验证工具。
- `server/capture-store.mjs`：目录同步、抓拍持久化、三张分组和照片排版。
- `tests/`：隔离后端测试；`.data/`：忽略的实际抓拍与索引。
- `docs/sessions/`：仅在用户要求 git 存档或 exit 时写会话日志。

## 当前状态
- 活跃分支：`feature/device-upload-deployment`，基于完整漫画版本新增设备直传、服务器登录/配置、Docker部署文件与交付文档；已创建并推送私有仓库 https://github.com/Allenkzl/CatApp ，默认分支为本功能分支；保留本地main，未合并。
- 已完成功能：工作台、观测筛选、双猫档案、事件复核、片段统计、四/六格模拟漫画编辑、审核、SVG 导出、作品库、本地素材导入与持久化、设置及 JSON 导出。
- 新流程：持续真实抓拍、同摄像头同北京日期按 N 张组图、DeepSeek 英文故事、Seedream 英文手绘漫画、原图回看和 PNG 下载；两篇2560×1440真实绘图已生成。旧事件和作品保留，review/studio 导航注释且路由暂停。

## 重要约定
- 2026-10-26换网排障：当前测试站 http://192.168.6.245:4180，相机192.168.4.186；设备config.json原上传地址仍为192.168.50.109且采集上传进程已停止。已备份配置、改为新站并启动现有上传器，设备凭证和心跳验证通过；用户重新展示cat识别画面后，3张真实新照片已入库（总数7→10），2026-10-26新组已形成并生成英文故事。识别服务运行不等于抓拍上传器运行，当前仍未安装开机守护。
- 自动同步每3秒继续获取完整状态，但渲染HTML未变化时保持现有DOM，避免心跳时间戳导致整页替换/图片重载；页面标题不再播放入场动画。测试覆盖连续心跳DOM稳定及作品状态自动更新。
- 用户要求当前局域网测试站免登录：`.data/server-local-env.json` 设置 `CAT_REQUIRE_LOGIN=false`，服务器模式仍使用设备上传凭证。默认服务器与Docker部署仍需管理员登录；API快照requireLogin控制退出按钮。
- 全站语言通过右上角切换，默认中文，独立存储键 `catapp-language` 记住选择；`src/messages.js` 为本地词典，`src/i18n.js` 的 `html` 标签只翻译模板静态部分。用户输入、原始照片文件名、批次和目录保留原文；已知默认演示字段仅在展示时翻译，保存未改字段时保留原始值。
- 每日漫画 SVG 接口支持 `?lang=en` / `?lang=zh`（默认中文），按请求生成，不修改作品索引和原图；修改该接口后需重启本地 Node 服务。
- 本轮已授权本机 Node 监督独立 SSH 采集器，并调用 DeepSeek 官方看图接口编写故事；不操作 GPIO、不修改原 reCamera 项目，不向外部平台发布。用户已授权 Ark / Seedream 付费绘图，自动图片明确未人工审核；不能把接口失败或等待状态标成漫画已完成。
- 明确区分观测事实与创作内容，未知身份保留为未知。
- 开发前确认分支；完工后提交，等待用户确认合并。不主动配置远程或推送。
- 数据不足不输出长期性格结论；正式画像需满足 PRD 的观察窗口与有效日条件。
- 运行 `npm run dev`，打开 `http://localhost:4173`；无安装和构建步骤。端口与主机名不同会使用独立的浏览器数据。
- 首页小时图、地图轨迹是固定演示；画像积累只是演示进度。习惯页区域占比根据已确认片段计算，片段时长可能重叠，不是全天有效覆盖。
- 新版作品保留原图及 DeepSeek 英文故事（1–6格），Seedream 自动绘图；仍支持已审核 PNG 回填。故事与对白为虚构，不能确认身份、持续时长或连续事件。旧模拟作品只读保留。
- 默认只读 `~/Desktop/reCamera猫观察/cats-*/photos.json`，启动时 `CAT_CAPTURE_DIR` 可覆盖；后端每 2 秒同步、前端每 3 秒读取。同期接口测试 `smoke-*` 不导入。
- `.data/captures.json` 与 `.data/media` 保存抓拍和作品关系，正常重启恢复；同一摄像头同一北京时间日期每 N 张一篇，默认 3，可在空间设置改为 1–12；当前未满组冻结原目标，新数量从下一组生效；不跨摄像头/日期混图，按批次+文件名去重。只接收已完成 JPEG，源图片应视为不可变。
- 备份整个 `.data/`；不要多个进程共用一个数据目录；测试用独立 `CAT_DATA_DIR`。摄像头在线状态和本机目录可读是不同概念。
- 已完成一次真实 DeepSeek 看图故事调用；已核实原链路使用 root 账户（网页账户不可直接等同 SSH 账户）；真实设备持续采集已收到本轮3张手机照片并自动形成第二篇英文故事。验收状态不要仅凭后台进程或测试通过推断。
- 浏览器流程验证脚本 `scripts/verify.mjs` 使用现有 Playwright/Chrome，独立测试会话，不污染用户数据；截图在忽略目录 artifacts。

- `server/auto-comic.mjs` 单并发故事队列；429/5xx 最多尝试3次，超时与中断需手动重试。未配置绘图时停留 `awaiting_image_provider`；已配置时进入 `drawing`，成功入库，失败 `image_failed`，只重试绘图阶段。`server/collector.mjs` 监督采集，设置页可配置 SSH、启动/停止。服务重启恢复采集会话，不是系统开机服务。
- `.data/secrets.json` / `seedream-config.json` / `collector-config.json` 为0600本机私有凭据，不返回API、不可提交或分享。`npm run test:camera` 验证出现/离开/周期补拍，`node scripts/verify-auto.mjs` 验证隔离UI流程。运行说明见 `docs/COMIC_GENERATION.md`。
- 本分支从 main 保留双语界面，移植 `df73ac3` 的手绘发布模块并适配任意数量；原独立手绘工作区4174仍保留，当前集成版使用4173。

- `server/seedream.mjs` 为固定官方 Ark 接口适配；代码缺省模型 `doubao-seedream-5-0-pro-260628`；本机实际配置为用户已开通的 `doubao-seedream-5-0-flash-260915`，两篇已成功。设置页支持模型 ID 或 ep 接入点；ModelNotOpen 需账户开通。绘图无自动重试，超时/重启需人工确认后重试；已返回PNG先缓存，发布失败不重付费。自动发布元数据准确记录 seedream-api、模型和未人工审核状态。

- `CAT_MODE=server` 必须配置 `CAT_PUBLIC_URL` 与至少12字符管理员密码；监听0.0.0.0，服务器模式不读取SSH配置、不扫描桌面目录。公开部署需HTTPS反代保持Host及持久化CAT_DATA_DIR，单进程使用数据目录。
- `server/access.mjs` 管理8小时HttpOnly会话、登录限次、独立设备Bearer凭证；`devices.json` 仅存设备凭证哈希。设备凭证不能管理网站。上传图片走POST /api/device/photos，原始JPEG及固定photoId/带时区时间；重复同内容ACK、冲突409。
- `scripts/recamera/upload_to_website.py` 直接在设备检测/拍照/上传，独立outbox、网络补传、最多100张待传；共享旧采集锁，不修改模型/GPIO。首次部署可用SSH，日常传输为HTTP/HTTPS。凭证不随重定向发送。
- 2026-10-21现场：新设备192.168.50.94已验证root/Python3.11.6/websockets10.4，完成单张真实抓拍→局域网后台直传；用户随后反馈完整流程测试成功；正式服务器仍须重新验收。独立直传测试站 http://192.168.50.109:4180，数据 `.data/device-live`；旧4173与原两篇漫画保留。测试登录信息仅在忽略的 `.data/server-login.txt`。
- 本轮最终验证：33项Node测试、6项Python设备测试、服务器与原本地模式桌面/移动浏览器流程均通过；未用模拟测试冒充新设备三张猫的现场生成验收。
- Docker交付：Dockerfile使用node:22-bookworm-slim，非root1000:1000，Compose将服务器专用数据目录绑定到/app/data，默认仅本机端口且关闭付费生成；上线需显式开启。说明见docs/OPS_HANDOFF.md与docs/OPS_MESSAGE.md，Docker模板用deploy/.env.example。
- 本机无Docker Engine/CLI，本轮只交付构建/运行文件和隔离容器验证脚本，未声称已构建镜像或验证容器；公网、设备守护及正式验收由运维部署阶段执行。交付说明见README与docs/DEVICE_UPLOAD.md。`.env.example` 仅含占位值，可提交；所有真实凭证、运行照片、登录信息仍在忽略目录。

## 变更日志
| 日期 | 分支 | 说明 |
| --- | --- | --- |
| 2026-10-19 | main | 初始化本地项目，确认原型范围与开发约定。 |
| 2026-10-19 | feature/website-prototype | 完成本地网站初版与模拟业务闭环，支持持久化、复核、漫画编辑和审核导出；通过桌面及移动浏览器流程验证。 |
| 2026-10-20 | feature/recamera-daily-comic | 接入 reCamera 电脑抓拍目录，三张自动组成每日图文漫画并入库；保留旧数据，暂停复核与工作室入口，支持原图和 SVG。 |
| 2026-10-20 | feature/bilingual-ui | 新增右上角全站中英切换、语言记忆与双语 SVG；保留用户原文及原始采集数据，完成双语桌面/移动浏览器验证。 |
| 2026-10-20 | main | 合并 feature/bilingual-ui（包含此前网站原型和真实抓拍功能），全站中英文切换及双语 SVG 进入主分支。 |
| 2026-10-20 | feature/continuous-auto-comic | 新增持续 SSH 采集器、默认3张可配置组图、冻结当前组、DeepSeek 自动英文故事、作品库等待绘图状态与本机私有配置；已通过隔离验证及真实故事调用，已连接摄像头持续监听，待手机新抓拍验收。 |
| 2026-10-20 | feature/continuous-auto-comic | 接入 Seedream 多图参考英文漫画、设置页私有配置与绘图单独重试；28项测试及隔离浏览器通过，真实两篇请求均 ModelNotOpen，等待账户开通后生成验收。 |
| 2026-10-20 | feature/continuous-auto-comic | 用户开通并切换 Seedream 5.0 Flash（260915），已有两篇英文故事均生成2560×1440三格漫画并入库；已看图核对英文和画风，作品保留自动生成未人工审核标记。 |
| 2026-10-21 | feature/device-upload-deployment | 新增HTTP设备直传、串行幂等入库、服务器登录及设备凭证、独立目录配置、接入与交付说明；新相机真实单张上传成功，33项后端与6项设备测试及双模式浏览器通过；私有GitHub仓库已推送，完整三张现场验收待用户测试。 |
| 2026-10-21 | feature/device-upload-deployment | 用户确认业务测试成功；新增Dockerfile、Compose、环境模板、Nginx示例、隔离容器检查与运维部署/备份/回滚说明，本机无Docker未执行构建或容器验收。 |
| 2026-10-21 | feature/device-upload-deployment | 新增显式测试免登录开关，当前4180测试站直接进入；默认部署登录和设备鉴权保留。 |
| 2026-10-21 | feature/device-upload-deployment | 修复周期闪烁：相同显示内容跳过DOM重建，移除标题入场动画；保留实时抓拍与作品状态同步。 |
| 2026-10-26 | feature/device-upload-deployment | 修复换网后设备仍上传旧地址及上传器停止的问题；新站可从相机访问、凭证有效、心跳在线，用户现场重测收到3张新照并生成当日英文故事，抓拍→上传→入库已恢复。 |
