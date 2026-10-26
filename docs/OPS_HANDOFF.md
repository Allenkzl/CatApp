# CatApp 运维交接说明

## 交付状态与入口

另有2026-10-26完整运行资料的加密GitHub Release备份，含原始照片、漫画、日志和私有配置，恢复步骤见 [运行备份说明](RUNTIME_BACKUP.md)。下述“源码交接包不含数据”是指源码包，不能误认为完整数据未备份。

- 源码仓库：https://github.com/Allenkzl/CatApp 。2026-10-26核实当前为公开仓库，可直接访问；如果之后改回私有，需要仓库所有者为运维GitHub账号授权。
- 交付分支：`feature/device-upload-deployment`，未合并 `main`；以交接压缩包旁的 `SOURCE_VERSION.txt` 中完整 commit 为准，不部署旧 `main`。
- 2026-10-21 用户反馈现有设备直传及漫画流程测试成功。已有本地软件验证记录；正式服务器仍须重新验收。
- 本包提供 Dockerfile、Compose、配置模板、Nginx 示例、设备脚本及运维说明，**不含已构建镜像、实际照片、模型密钥、设备 token 或管理员密码**。
- 制作本包的电脑未安装 Docker Engine/CLI，镜像构建、Compose 原生命令验证和容器测试尚未运行。运维需执行下文步骤；源码测试不能替代容器验收。
- 首次上线不强制迁移旧作品，建议使用独立空目录验收；如需迁移，见后文。

## 部署结构

```text
reCamera（检测、拍照、断网留存）
    → HTTPS 域名 → Nginx/公司网关 → 127.0.0.1:4173 → CatApp 容器
                                                    ↕ /app/data
                                           服务器 /srv/catapp/data
                                                    ↓
                                            独立备份位置
容器 → HTTPS 出网访问 DeepSeek、火山方舟
```

当前为一个 Node 进程、文件目录与 JSON 索引，不需要另建数据库或 GPU。只能一个实例写一个数据目录，不能多副本共享写入。照片及漫画容量随使用增长，运维按实际增长量安排磁盘、备份与容量告警。

网站建议使用独立域名根路径，如 `https://cats.company.example`；目前不支持直接挂到 `/catapp/` 子路径。公司网站可通过导航链接或独立子域名接入。

## 上线前需要双方确认

| 项目 | 责任与要求 |
| --- | --- |
| 服务器与架构 | 运维提供 Linux 主机，确认 `uname -m`；x86_64 对应 linux/amd64，aarch64 对应 linux/arm64 |
| Docker | 运维准备 Docker Engine 与 Compose v2，确认允许拉取基础镜像或提供可信内部镜像源 |
| 镜像交付 | 本包默认由运维在目标服务器构建；也可在公司CI构建，推入私有镜像仓库或导出离线镜像 |
| 域名与证书 | 运维配置 DNS、有效HTTPS证书及反向代理；相机必须能访问此域名 |
| 数据与备份 | 运维确定持久化绝对目录、备份目标、保留周期，不能把数据放在代码发布目录中 |
| 管理员与模型凭据 | 项目负责人通过公司认可的安全渠道单独提供；不写进源码、镜像或群聊交接包 |
| 出网 | 网站后台需访问 api.deepseek.com:443 与 ark.cn-beijing.volces.com:443；相机需访问网站:443 |
| 模型权限与余额 | 项目负责人确认 DeepSeek 可调用、Seedream 指定模型已开通并有可用额度 |
| 旧数据 | 项目负责人决定空库上线还是迁移，明确唯一数据源；不要合并多个 captures.json |
| 相机守护 | 运维按实际固件配置采集进程重启/开机启动；已有脚本不等于已安装系统服务 |

## 文件清单

| 文件 | 用途 |
| --- | --- |
| `Dockerfile` / `.dockerignore` | Node 22运行镜像，非root用户1000:1000；构建上下文仅允许程序文件 |
| `compose.yaml` | 单实例、只读根目录、数据挂载、自动重启及日志轮转 |
| `deploy/.env.example` | Docker部署专用配置模板，与根目录的原生Node模板区分 |
| `deploy/nginx.conf.example` | 同主机Nginx反代示例；修改域名、证书后再使用 |
| `scripts/verify-container.mjs` | 隔离容器测试：登录、三张上传、去重、重建保留数据；不付费 |
| `docs/DEVICE_UPLOAD.md` | 相机部署、接口、设备凭证与网络恢复说明 |
| `docs/OPS_MESSAGE.md` | 可直接转发给运维的简短交接消息 |

## 1. 获取固定源码版本

可解压交接包，或从GitHub拉取源码（若仓库转为私有，使用已授权账号）：

```bash
git clone --branch feature/device-upload-deployment https://github.com/Allenkzl/CatApp.git
cd CatApp
git rev-parse HEAD
```

核对交接的完整 commit。如从仓库拉取到更新版本，先与项目负责人确认；不要默认运行另一个分支。交接包附有SHA256文件，可用 `sha256sum -c 文件名.sha256` 校验。

## 2. 构建镜像并隔离验证

在目标架构服务器构建，避免在苹果电脑构建的arm64镜像直接交给amd64主机：

```bash
docker version
docker compose version
# RELEASE_ID 使用确认后的短commit，例如交接包 SOURCE_VERSION.txt 内的 short_commit。
# 以下示例名字 catapp:deploy-candidate 与模板一致；通过验收后再标记固定版本。
docker build --pull -t catapp:deploy-candidate .
# 需主机上已有Node 22；或者在公司CI执行此验证脚本。
node scripts/verify-container.mjs catapp:deploy-candidate
```

测试创建随机命名容器和Docker测试卷，关闭真实模型调用，并在结束后清理自己创建的资源，不接触正式数据。它验证容器替换后照片、组图及设备凭证仍存在。测试图只用于隔离验证，不代表真实猫检测和漫画质量。

验证后标记正式不可变版本，例如 `catapp:<short-commit>`，并把 `deploy/.env` 中的 `CAT_IMAGE` 改成该值。记录 `docker image inspect` 中的镜像ID；仓库方式交付同时记录digest。

若跨架构构建，使用已配置的 Buildx，例如：

```bash
# 仅示例：将版本与架构替换为实际目标；不包含镜像推送授权。
docker buildx build --platform linux/amd64 --load -t catapp:deploy-candidate .
```

需要离线镜像时，构建方在验证后执行 `docker save -o catapp-image.tar catapp:<short-commit>`，并提供SHA256；运维校验后执行 `docker load -i catapp-image.tar`。本次源码压缩包不是Docker镜像，不能直接 `docker load`。

## 3. 配置数据挂载与运行参数

在源码/交接包根目录操作：

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# Linux主机：仅创建本项目专用目录，保持UID/GID与容器一致。
sudo install -d -o 1000 -g 1000 -m 0700 /srv/catapp/data
```

填写 `deploy/.env`：

| 配置 | 值与约束 |
| --- | --- |
| CAT_IMAGE | 本次验证过的固定镜像版本 |
| CAT_HOST_DATA_DIR | 服务器绝对路径，例 /srv/catapp/data；目录必须事先存在，UID/GID 1000可读写 |
| CAT_PUBLIC_URL | 正式HTTPS Origin，必须与浏览器域名/端口一致，不带路径 |
| CAT_BIND_IP / CAT_HOST_PORT | 同主机Nginx默认127.0.0.1 / 4173；容器内固定4173 |
| CAT_ADMIN_USER / CAT_ADMIN_PASSWORD | 管理员用户名及独立强密码，至少12字符，不能保留REPLACE占位值 |
| DEEPSEEK_API_KEY | 官方DeepSeek密钥，或登录后在设置页配置 |
| SEEDREAM_API_KEY / SEEDREAM_MODEL | 方舟密钥及已开通模型；当前实测模型ID见模板，运营账户需自行开通 |
| CAT_AUTO_GENERATE | 先false验证基础设施；正式业务前显式改true并重建容器 |

密码/密钥可使用单引号包裹，防止其中的 `$` 被Compose插值；不要把真实值作为聊天截图或日志发回。环境变量中的模型配置会在启动时优先于数据目录私有配置；不要同时维护两套不一致的值。

```bash
# 只检查不打印展开后的密码；不要把完整 docker compose config 输出发到群里。
docker compose --env-file deploy/.env config --quiet
docker compose --env-file deploy/.env up -d --no-build --pull never
docker compose --env-file deploy/.env ps
curl --fail http://127.0.0.1:4173/healthz
```

`CAT_HOST_DATA_DIR` 是宿主机目录，`CAT_DATA_DIR=/app/data` 已固定在容器环境中；不要将后者误填成宿主机路径。启动失败先检查目录存在、权限、密码和URL，不以root运行来绕过权限问题。SELinux主机由运维为专用目录设置合适标签，不关闭全局SELinux。

## 4. HTTPS反向代理

参考 `deploy/nginx.conf.example`，将域名与证书换成公司实际值，验证 `nginx -t` 后按公司流程加载。示例假定Nginx运行在Docker宿主机；若Nginx也运行在容器，127.0.0.1指向Nginx自身，应由运维改成共享网络的服务地址。

必须满足：保留原始Host、允许至少30MiB的照片请求、将所有网站路径转发到后台、使用有效HTTPS证书。防火墙只对外开放必要的80/443，后台4173不直接开放公网。`/healthz`只代表服务存活，不代表设备在线或付费模型可用。

登录失败限流当前按连接来源地址；反代后多名管理员可能共享同一个限流桶。第一版是单管理员工具，公司若要求统一登录、多用户或更细限流，另作接入。

## 5. 业务开启与相机切换

1. 通过HTTPS域名登录，检查空间设置、生成数量及设备列表。
2. 保持 `CAT_AUTO_GENERATE=false` 时不要把隔离测试照片灌入正式库；隔离验证用上面的容器脚本。
3. 填好模型凭据并确认账户权限与额度；将 `CAT_AUTO_GENERATE=true`，重新执行 `up -d --no-build --pull never`。
4. 确认新站是空库还是完整迁移库。如果迁移设备凭证哈希且保留原设备token，可以沿用；否则在新站设置页注册/生成设备配置。
5. 按 `docs/DEVICE_UPLOAD.md`，安全停止仅本项目的旧上传进程，备份其私有配置，把 `website_url` 改成正式HTTPS地址，并填写该站对应的设备凭证。更换地址前盘点相机待传outbox；未确认接收的照片保留补传，不能直接清空。
6. 确保只运行一个采集进程。运维为已确认的进程配置固件适用的守护/开机启动，再检查相机重启后的恢复。
7. 展示三个不同猫动作，检查设备在线、三张观测记录、作品组图、英文故事和完整漫画图片。完成后验证PNG下载。
8. 新站验收通过后再停用电脑旧测试站，保留旧数据备份。

失败状态必须保留供检查，不能手动改成完成；绘图超时/重启中断时不要反复点重试，先核实是否已有付费结果缓存。

## 6. 迁移现有照片和漫画（可选）

项目目前可能有多个数据目录：旧本地站 `.data/`、直传测试站 `.data/device-live/`。先与负责人确定**一个**源目录及迁移范围，不把外层 `.data/` 连同其嵌套测试目录整体混入正式库。

暂停该源的采集，等待故事/绘图请求完成，停止对应后台；同时停止目标后台。复制所选数据目录的内容（captures.json、media、comics、jobs、devices.json及所需私有配置）到空的正式数据目录，保持相对路径，调整此专用目录内容的UID/GID为1000:1000，然后再启动目标站。它可能包含密钥，必须通过安全渠道传输。

迁移后检查作品数量、原图、漫画、PNG下载与重复上传。浏览器localStorage/IndexedDB中的旧演示资料不在服务器目录内，不会随域名迁移；本次交付不提供这些演示资料的自动搬迁。无法把不同数据源的JSON文件直接拼接。

## 7. 备份与恢复

每次升级前及按公司周期备份。挂载保留数据不等于备份；备份须另存并限制访问，因为可能含照片与私有配置。

先暂停相机上传并等待生成任务结束，再停止服务，避免复制到半写入索引。示例只适用于默认目录，运维根据实际路径调整：

```bash
docker compose --env-file deploy/.env stop
# /srv/catapp-backups 必须由运维预先创建并限制权限。
sudo tar -czf /srv/catapp-backups/catapp-data-YYYYMMDD-HHMMSS.tar.gz -C /srv/catapp data
docker compose --env-file deploy/.env up -d --no-build --pull never
```

另行安全备份 `deploy/.env`、镜像版本/digest和反代配置。备份失败时不要直接开始升级，先恢复服务并排查。

恢复时停止服务，保留当前数据目录作为故障证据，将备份恢复到一个空目录，校验UID/GID与完整性，修改CAT_HOST_DATA_DIR指向恢复目录，再启动并检查原图与漫画。先在隔离环境执行一次恢复演练，不覆盖正在使用的数据。

## 8. 升级与回滚

- 升级前：暂停相机、排空生成任务、停止服务并备份数据及配置，记录旧镜像版本/digest。
- 拉取或构建新镜像，执行隔离容器验证，通过后更改CAT_IMAGE，执行 `up -d --no-build --pull never`（仓库分发时先按公司流程 `docker pull` 固定版本）。
- 检查 `/healthz`、登录、历史原图、漫画，恢复相机并验证新记录。
- 回滚先停新服务；若新版本改变了数据格式或写入不兼容数据，使用旧镜像和对应的升级前备份，不能只改镜像标签。备份后新增照片先留存，另行确认补录方式。
- 不运行 `docker system prune` 或删除正式数据目录作为排障手段。不要用自动重启或重复绘图请求掩盖接口错误。
- stop_grace_period是等待退出的上限，**不保证后台付费请求一定完成**；停止前必须在界面确认没有generating/drawing任务。中断请求重启后会标为失败，需要人工核查再重试。

## 9. 运维验收回执

请回传不含密码/token的结果：

- 源码完整commit、镜像版本/ID或digest、主机架构。
- 域名与HTTPS证书检查结果、健康检查结果。
- 宿主机持久化目录、目录权限、备份目标与恢复演练结果。
- 登录、三张抓拍、自动漫画、PNG下载结果（截图隐藏私有信息）。
- 替换容器后旧照片/漫画仍存在；相机重启、网络恢复后可继续上传。
- 剩余问题及需要负责人确认的事项。

## 技术参考

配置语法参考 [Docker Compose环境变量](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)、[挂载目录](https://docs.docker.com/engine/storage/bind-mounts/)、[多架构构建](https://docs.docker.com/build/building/multi-platform/)。以上为项目部署设计；实际构建与服务器验收记录以运维回执为准。
