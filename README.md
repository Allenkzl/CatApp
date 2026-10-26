# 阳台猫观察室 CatApp

reCamera Pro 猫咪观测与全英文漫画工作台。保留原始照片，通过 DeepSeek 编写英文故事和分镜，使用豆包 Seedream 生成暖色手绘漫画并保存到作品库。

```text
reCamera 检测猫、抓拍 → HTTP/HTTPS 直接上传网站
→ 按摄像头和北京时间日期，每 N 张一组（默认3）
→ DeepSeek 英文故事 → Seedream 漫画 → 作品库与PNG下载
```

## 当前交付状态

- 原本地目录/SSH模式保留；新增服务器模式，无桌面目录和SSH依赖。
- 服务器模式含网页登录、独立设备凭证、JPEG上传、设备活动状态、幂等确认、后台故事和绘图队列。
- 原两篇英文漫画已通过真实模型调用验证；新设备已完成真实单张抓拍→HTTP直传验证。新设备三张猫检测→模型生成的完整现场验收需另行测试。
- 完整功能已合并到 `main`；源码与后续交付以 `main` 的固定提交为准。已有部署流水线若限定旧功能分支，请运维调整为 `main`。
- 已补齐 Dockerfile、Compose、HTTPS反代示例和运维交接说明。当前电脑没有Docker，未构建或发布镜像；正式公网部署与容器验收由运维执行。
- 用户于2026-10-21反馈现有业务流程测试成功；正式服务器上线后需重新验收。

## Docker运维交付

从 [运维交接说明](docs/OPS_HANDOFF.md) 开始；简短转发文案见 [给运维的消息](docs/OPS_MESSAGE.md)。Docker使用 `deploy/.env.example`，原生Node仍使用根目录 `.env.example`，两者不能混用。配置持久化挂载后再部署，实际凭据不包含在交付文件中。

## 技术与环境

原生 HTML/CSS/JavaScript ES Modules，Node.js 22 LTS 或更新兼容版本，无第三方运行依赖。设备端使用Python 3.11与websockets 10.4（新设备已核实），仅部署设备采集脚本时需要。网站后台不执行猫检测推理，不要求GPU。

首次获取源码后无需 `npm install`。测试脚本的浏览器验证使用本机已有Chrome与Playwright，详见脚本参数和测试章节。

## 本地模式：保留原工作流

```bash
npm run dev
```

打开 http://localhost:4173 。默认只监听本机；读取 `~/Desktop/reCamera猫观察/cats-*/photos.json`，在 `.data/` 保存照片和作品。已有SSH采集配置可继续使用。更换数据与目录：

```bash
CAT_DATA_DIR=/absolute/path/data CAT_CAPTURE_DIR=/absolute/path/captures npm run dev
```

## 服务器模式：设备直传

1. 将 `.env.example` 复制为私有 `.env`，设置真实配置。
2. 创建持久化数据目录并赋予运行账户读写权限。
3. 在Node 22中运行：

```bash
node --env-file=.env scripts/serve.mjs
```

关键配置：

| 名称 | 说明 |
| --- | --- |
| `CAT_MODE=server` | 启用登录和直传；禁用SSH启动与桌面扫描 |
| `HOST` / `PORT` | 监听地址及端口，服务器默认0.0.0.0:4173 |
| `CAT_PUBLIC_URL` | 完整对外Origin，如 `https://cats.example.com`，不含路径 |
| `CAT_DATA_DIR` | 持久化数据目录，默认源码目录的 `.data/` |
| `CAT_ADMIN_USER` / `CAT_ADMIN_PASSWORD` | 管理员用户名与至少12字符密码；通过环境注入，不进入镜像/源码 |
| `DEEPSEEK_API_KEY` | 官方DeepSeek看图故事接口密钥 |
| `SEEDREAM_API_KEY` / `SEEDREAM_MODEL` | 方舟密钥与已开通模型；建议用户已验证的 `doubao-seedream-5-0-flash-260915` |
| `CAT_AUTO_GENERATE=false` | 隔离测试时关闭所有付费生成 |
| `CAT_DEVICE_ID` / `CAT_DEVICE_TOKEN` | 可选预置设备，token至少24字符；也可登录后在设置页生成；已保存的轮换凭证优先于环境预置值 |

服务器模式默认先进入 `/login`。本机局域网测试可显式设置 `CAT_REQUIRE_LOGIN=false`，直接访问网站并隐藏退出登录按钮；设备上传仍需独立凭证。此开关默认保持登录保护，Compose正式部署模板不关闭登录。登录后在空间设置生成设备上传配置；凭证只显示一次，同名设备重新生成会使旧凭证失效。模型配置与照片接口要求网页登录，设备Bearer凭证没有管理权限。会话有效期8小时，服务重启后重新登录；登录失败10次/10分钟限流。

公网部署由反向代理提供HTTPS，保留原Host请求头；`CAT_PUBLIC_URL` 必须与浏览器地址一致。网站后台需能联网访问DeepSeek/Seedream；相机只需能访问网站上传地址。仅明确的局域网测试使用HTTP。`GET /healthz` 为无需登录的最小健康检查。

## 摄像头接入

见 [设备直传说明](docs/DEVICE_UPLOAD.md)。设备只持有网站上传凭证，不持有模型密钥。上传失败留在设备独立outbox中，成功ACK后清理；服务器重传去重，不重复组图。

新相机需要首次部署脚本。日常抓拍和上传由设备自身运行，网站服务器无需通过SSH登录相机。

## 存储与迁移

2026-10-26完整运行资料已另行制作GitHub加密迁移备份，含真实凭据、照片、漫画和原始日志；下载、解密及首次导入步骤见 [完整运行备份](docs/RUNTIME_BACKUP.md)。源码Webhook更新不等于覆盖服务器持久化目录。

业务数据位于 `CAT_DATA_DIR`：照片 `media/`、漫画 `comics/`、索引 `captures.json`、付费输出缓存 `jobs/`。备份和迁移业务数据须在停止服务后进行，并验证恢复。运行凭据与照片分开交付，不能上传GitHub。

- 同一个数据目录只能由一个Node进程使用；当前JSON索引按单实例设计。
- `devices.json` 存设备token哈希；网页登录会话只在内存，不跨重启。
- 本地私有配置：`secrets.json`、`seedream-config.json`、`collector-config.json`，权限0600，均忽略。
- 服务重启不会自动重发未知是否计费的模型请求；中断任务明确失败后手动重试。已返回绘图结果缓存可复用，避免重复付费。
- 浏览器localStorage/IndexedDB仍保留旧原型档案、模拟事件及人工素材；不同域名或浏览器不会自动共享这些旧数据。实际抓拍、组图与漫画以服务器数据为准。

## 验证

```bash
npm run check
npm test
npm run test:camera
npm run verify:server
```

最后一项需要已有Playwright及Chrome，可设置 `PLAYWRIGHT_MODULE` 与 `CHROME_PATH`。它启动隔离服务器、测试登录/权限、三张直传、重复ACK、组图和重启恢复，不调用付费模型，不污染真实数据。截图在Git忽略目录 `artifacts/`。

原英文故事/漫画流程及手工PNG回填见 [漫画说明](docs/COMIC_GENERATION.md)。

## 边界

单张抓拍不能确认猫的身份、持续时长或连续事件。故事和对白为虚构，自动漫画默认标记尚未人工审核。画像和习惯页的旧数据仍是演示内容。当前未配置系统开机服务；相机与后台重启后的进程管理交给后续部署阶段。

## 界面与素材

右上角可切换中文/English并记住语言。`src/messages.js` 与 `src/i18n.js` 只翻译固定界面文案，保留用户输入、文件名、批次和目录原文。漫画图片固定全英文，旧SVG语言按请求生成。

旧版角色参考照片来自 Unsplash `photo-1573865526739-10659fec78a5` 和 `photo-1518791841217-8f162f1e1131`，仅作原型素材，不对应实际采集个体。画风参考为项目生成插画。
