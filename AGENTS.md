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
- 活跃分支：无。`feature/manual-comic-generation` 已按用户确认无冲突合并到 main，功能提交 f248777；每日自动英文故事、逐篇手动付费绘图。待用户授权推送及线上部署验证，当前不能视为云端已生效。
- 已完成功能：工作台、观测筛选、双猫档案、事件复核、片段统计、四/六格模拟漫画编辑、审核、SVG 导出、作品库、本地素材导入与持久化、设置及 JSON 导出。
- 新流程：相机压缩HTTPS直传、按摄像头及北京时间每日归档、次日00:10调度、目标6–8格英文总结漫画、只读素材预览、原图和PNG下载。旧批次暂停，已完成作品保留；review/studio导航仍暂停。新版每日真实成品尚待正式站验收。

## 重要约定
- 2026-10-29手动绘图版：自动管线只到story_ready，故事正常入库可读；Seedream仅消费网站按钮付费确认后的image_queued/drawingRequested任务。自动开关控制DeepSeek读图/故事，仍有文字/视觉API费用；明确确认的绘图独立执行。旧等待故事升级就绪，旧失败和成品保留，不自动重画。浏览器请求ID持久化防重，失败重试需再次确认可能已计费。超时600秒，保留所有缓存；新站默认daily，已有hourly/daily选择保留。上线标识story-manual-drawing-v1，详见docs/MANUAL_DRAWING.md。
- 2026-10-28小时验证版：首次升级缺频率/新站默认hourly，从启用起每60分钟一篇；已保存daily选择保留。空间设置可切回daily（次日北京时间00:10）。按时段/相机唯一ID、空时段不生成，频率切换后旧频率未完成任务不自动付费执行，完成的小时结果在每日列表折叠历史中保留。
- 新任务pipelineVersion=2，冻结时段全部已上传来源，每批最多6张看图，12路层级汇总，最终单篇英文故事与6–8格漫画；缓存按照片ID/内容/模型/版本复用，暂停/断点不重读已完成证据。相册按24张分页，迟到照片动态归档并标记未进入冻结故事，不自动重画。不得把参考图筛选数当成全量分析数。
- Seedream Flash真实API返回面积上限4624220，旧1920×2560请求400；时段竖图改1728×2304后真实六张照片→英文故事→PNG成功。样例实际格数/编号有模型偏差，仍未人工审核，不自动反复绘图扣费。新提示明确两列和编号唯一，待用户验证。
- 发布标记：/healthz与/api/capture release=hourly-comic-v1，页面页脚“小时全量测试版”。必须核对hourly频率、workerEnabled及nextRunAt才能开始一小时验收，推送/Webhook triggered=true不等于上线。详见docs/HOURLY_VALIDATION.md。
- 历史2026-10-27每日抽样总结改造（已由10月28日全量版本替代）：默认同摄像头/北京时间日期一篇，次日00:10入队、目标8格（可选6–8），素材不足缩短。首启从当日起生效，暂停未完成旧批次但保留原图及已完成作品；不批量回填启用前历史，不因重启/晚到/改时刻重复绘图。今日预览仅素材计划、不调用付费模型。采样最多18张按时间分散，不能据此断言全天行为或个体身份。
- 2026-10-28起每日模式以settings.autoGenerateEnabled为准，默认true；空间设置或POST /api/settings可立即保存布尔开关并持久化，覆盖旧CAT_AUTO_GENERATE=false，无需运维改环境或重启。已有false保留，非法类型拒绝。开关关闭不取消已发出的请求，但阻止后续阶段；重开继续每日队列。旧批次迁移暂停后才初始化worker，避免默认开启触发旧队列。快照workerSource=website_setting，关闭原因为website_setting_disabled。模板环境变量只保留旧批次兼容含义。
- 2026-10-26起源码主线为main；后续推送及运维部署应以main的固定commit为准。已有Webhook若限定feature/device-upload-deployment，需运维调整为main；不能仅凭GitHub默认分支变更推断外部Webhook已改好。历史Release快照及其口令不因合并改变。
- 2026-10-26用户明确授权完整运行资料上云：本地项目和.data原内容已做加密快照，33张当前站照片/10篇作品及旧站、真实凭据和完整日志均包含；加密包已上传GitHub Release并核对远端SHA256一致，解密口令已放仓库Secrets，明文配置仍忽略。恢复需运维一次导入持久化目录，Webhook源码更新不会自动覆盖数据；见docs/RUNTIME_BACKUP.md。
- 2026-10-26推送前通过GitHub核实Allenkzl/CatApp已是PUBLIC（最初创建时为私有），本轮不改变仓库可见性；仅推送源码和排障记录，凭据/照片/完整运行日志保持忽略。
- 2026-10-26测试站再次不可访问：确认4180无监听、旧执行会话不存在，IP和数据索引正常，缺少历史退出日志，不能确认代码崩溃原因。改用Node detached独立进程组运行，已核实PPID=1；私有日志`.data/server.log`、PID记录`.data/server.pid`。未安装开机守护，重启电脑仍需启动服务；处理进程前核对PID实际命令，不能只信PID文件。恢复后33张照片、10篇作品记录、相机心跳在线。
- 2026-10-26换网排障：当前测试站 http://192.168.6.245:4180，相机192.168.4.186；设备config.json原上传地址仍为192.168.50.109且采集上传进程已停止。已备份配置、改为新站并启动现有上传器，设备凭证和心跳验证通过；用户重新展示cat识别画面后，3张真实新照片已入库（总数7→10），2026-10-26新组已形成并生成英文故事。识别服务运行不等于抓拍上传器运行，当前仍未安装开机守护。
- 自动同步每3秒继续获取完整状态，但渲染HTML未变化时保持现有DOM，避免心跳时间戳导致整页替换/图片重载；页面标题不再播放入场动画。测试覆盖连续心跳DOM稳定及作品状态自动更新。
- 用户已明确要求线上和本地均默认免登录：Node默认关闭，Docker ENV与Compose透传CAT_REQUIRE_LOGIN默认false，模板一致；显式true才启用登录且校验管理员密码。设备上传凭证独立保留。部署平台若保存true需改false并重建容器；仅推源码不能覆盖平台环境变量。API快照requireLogin控制退出按钮。
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

- `CAT_MODE=server` 必须配置 `CAT_PUBLIC_URL`；仅CAT_REQUIRE_LOGIN=true时还需至少12字符管理员密码；监听0.0.0.0，服务器模式不读取SSH配置、不扫描桌面目录。公开部署需HTTPS反代保持Host及持久化CAT_DATA_DIR，单进程使用数据目录。
- `server/access.mjs` 管理8小时HttpOnly会话、登录限次、独立设备Bearer凭证；`devices.json` 仅存设备凭证哈希。设备凭证不能管理网站。上传图片走POST /api/device/photos，原始JPEG及固定photoId/带时区时间；重复同内容ACK、冲突409。
- `scripts/recamera/upload_to_website.py` 直接在设备检测/拍照/上传，独立outbox、网络补传、最多100张待传；共享旧采集锁，不修改模型/GPIO。首次部署可用SSH，日常传输为HTTP/HTTPS。凭证不随重定向发送。
- 2026-10-21现场：新设备192.168.50.94已验证root/Python3.11.6/websockets10.4，完成单张真实抓拍→局域网后台直传；用户随后反馈完整流程测试成功；正式服务器仍须重新验收。独立直传测试站 http://192.168.50.109:4180，数据 `.data/device-live`；旧4173与原两篇漫画保留。测试登录信息仅在忽略的 `.data/server-login.txt`。
- 本轮最终验证：33项Node测试、6项Python设备测试、服务器与原本地模式桌面/移动浏览器流程均通过；未用模拟测试冒充新设备三张猫的现场生成验收。
- Docker交付：Dockerfile使用node:22-bookworm-slim，非root1000:1000，Compose将服务器专用数据目录绑定到/app/data，默认仅本机端口；新版每日付费生成由网站持久化开关控制，默认开启。说明见docs/OPS_HANDOFF.md与docs/OPS_MESSAGE.md，Docker模板用deploy/.env.example。
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
| 2026-10-26 | feature/device-upload-deployment | 测试站进程退出后恢复为独立后台进程并启用日志；页面/API及相机心跳验证正常，原始退出原因因无日志暂不能确认。 |
| 2026-10-26 | feature/device-upload-deployment | 按用户明确要求整理近期修改和排障记录并同步GitHub；新增docs/OPERATIONS_STATUS.md及安全检查后的启动日志摘录，私有配置与实际数据不上传。 |
| 2026-10-26 | feature/device-upload-deployment | 按用户授权将完整运行资料加密包及恢复指引上传GitHub Release，解密口令保存Secrets；远端218673936字节及SHA256与本地一致，原始文件保留，不能每次自动部署都重置数据。 |
| 2026-10-26 | main | 按用户确认no-ff合并feature/device-upload-deployment，无冲突；更新交付主线为main，同步远端main及默认分支，清理本地已合并分支，远端功能分支暂保留兼容现有Webhook。 |
| 2026-10-26 | main | 用户要求正式站默认免登录，修复此前只关闭本地、Docker/Compose仍启用登录的问题；统一默认false并透传开关，显式true可启用，设备鉴权保留；35项后端及浏览器验证通过，功能修复4b21788已推main；推送后线上仍303到/login，待运维切main重建并核对平台环境变量，不能标记线上验收完成。 |
| 2026-10-27 | fix/camera-cloud-upload | 设备上传支持 ca_file 并明确客户端标识，6项设备测试通过、相机云端心跳200；真实约1.3MB照片被线上代理413拒绝，未入库，已备份并回退本地上传，待运维调整请求体上限后重测。 |
| 2026-10-27 | fix/camera-cloud-upload | 新增默认900KiB上传前压缩及稳定重试，使用设备OpenCV兼容硬件JPEG；8项测试通过，真实单张825337字节直传云端并可读，相机持续进程3986在线；模型未配置，随后持续阶段又自动新增1张、总数2，自动漫画仍待配置。 |
| 2026-10-27 | fix/camera-cloud-upload | 按用户授权使用本机现有凭据配置云端DeepSeek及Seedream，两次保存HTTP200，状态均configured，绘图模型flash-260915；未输出密钥或提交凭据，当前云端2张照片/0篇作品，尚未触发真实生成，CAT_AUTO_GENERATE运行开关未能从公开快照确认。 |
| 2026-10-27 | feature/daily-cat-summary | 完成北京时间次日00:10每日唯一调度、时间采样、6–8格英文竖版、无付费素材预览与设置、旧批次暂停和worker关闭提示；44项Node测试、隔离每日浏览器及服务器回归验证通过。未合并/推送、未改线上环境、未调用真实模型生成新成品，待正式部署验收。 |

| 2026-10-27 | main | 按用户确认no-ff合并feature/daily-cat-summary（包含相机压缩直传修复），无冲突；清理两个已合并的本地分支，准备推送触发部署。自动生成仍须核对运行环境CAT_AUTO_GENERATE=true，不能把源码推送当成开关已启用或真实成品已生成。 |

| 2026-10-28 | fix/web-auto-generation-switch | 每日worker改读网站持久化布尔开关，默认开启且覆盖旧环境false，设置页可暂停/恢复并重启保留；49项后端测试及每日中英手机浏览器验证通过，测试覆盖在途请求完成后暂停绘图、重开不重复故事及旧队列不唤醒。尚未合并推送/部署；全量读图与昨天补生成仍是后续任务。 |

| 2026-10-28 | feature/hourly-comic-validation | 完成小时验证/每日切换、完整时段分批读图及缓存层级汇总、相册分页与迟到标记、英文排版规范化和Flash尺寸修复；56项后端测试、小时/每日/服务器浏览器验证通过，另用6张云端真照和真实DeepSeek/Seedream完成隔离生成；样例有格数编号偏差，保留未审核。用户授权上线，待合并发布及站点标记验收。 |

| 2026-10-28 | main | 按本轮上线授权no-ff合并feature/hourly-comic-validation（含网站开关修复），无冲突；清理两个已合并本地分支。发布目标为main与历史部署兼容分支同一提交，禁止强推；正式站须核对hourly-comic-v1、hourly频率、workerEnabled及nextRunAt后才开始一小时验收。 |

| 2026-10-28 | main | 运维修正更新流程后，容器及公开API均返回hourly-comic-v1/pipeline2；小时频率、网站自动开关和两套模型正常，204张原图保留，旧批次暂停，新窗口已开始。修正关键是同步origin/main、按提交号建镜像、CAT_IMAGE显式透传并force-recreate；首次小时入队19:25:57，尚不等于已生成成品。 |

| 2026-10-28 | main | 按用户要求正式站从hourly切回daily，次日北京时间00:10、自动生成开启、目标8格；保存后独立GET验证成功，两套模型已配置，相机在线，当时206张原图（10月28日125张）；切换时无在途模型任务，未触发额外付费或重建容器。首轮10月29日00:10入队，成品仍待实际验收。 |

| 2026-10-29 | feature/manual-comic-generation | 按用户新设计将自动每日故事与付费绘图分离；新增故事内手动确认、持久化防重及独立绘图队列，延长Seedream等待至600秒，保留旧故事/照片/漫画及付费缓存。60项后端、8项相机测试及手动/每日/小时/服务器浏览器回归通过，未操作云端真实绘图；待用户确认合并。 |

| 2026-10-29 | main | 按用户确认no-ff合并feature/manual-comic-generation，无冲突；每日自动故事、手动付费绘图及600秒超时进入main，清理已合并本地分支。尚未推送或部署，线上以story-manual-drawing-v1验收。 |
