# GitHub 交付与设备照片直传

用户确认执行此前前3阶段：整理源码、建立 Allenkzl/CatApp 私有仓库、补齐服务器运行能力；新分支 feature/device-upload-deployment 从完整漫画功能版本创建。新相机地址192.168.50.94，实际设备和登录需现场复核。本轮不制作Docker镜像或部署公网服务。

## 方案

保留本机目录+SSH模式，新增server模式：独立数据目录、配置监听地址/公共Origin、健康检查、网页登录和专用设备Bearer凭证。静态入口只开放页面及src/public资源，不暴露源码工具与配置。云服务不加载或启动SSH采集器、不扫描桌面目录。

设备上传协议为 POST /api/device/photos，原始JPEG请求体；凭证对应唯一deviceId，头部携带photoId及带时区capturedAt。后端校验JPEG、大小、元数据，按设备+photoId去重；重复相同图片返回同一ACK，ID冲突返回409。原子保存后ACK，再进入复用的N张组图及模型队列。不信任客户端传来的其他设备身份。设备心跳接口与目录可读状态分开。

CaptureStore抽出公共组图函数；新增串行ingestUpload，无输入目录也可保存、组图、重启恢复。保留已有数据和双语界面，上传来源准确展示。网站用户登录会话与设备凭证独立，模型密钥只在后台。管理员使用环境或私有配置传入，登录限次、同源校验及安全Cookie。

设备端Python上传程序复用现有Camera、AppearanceGate、cat_score；图片和固定ID先进入本机outbox，成功ACK后清理，断网重试不阻塞检测采集；失败保留，凭证无效不反复认证。使用同一设备采集锁，部署前确认旧采集停止；不操作GPIO和模型。HTTP只用于明确允许的局域网测试，正式使用HTTPS。

## 改造文件

server/runtime-config.mjs: server/local运行配置、网络和Origin检查。
server/access.mjs: 登录会话、设备Bearer配置与活动状态。
server/capture-store.mjs: ingestUpload、公共组图和目录可选。
scripts/serve.mjs: app整合、上传/心跳/登录/健康接口和静态文件白名单。
src/capture.js、src/app.js: 服务器模式设备接入状态，保持双语。
scripts/recamera/upload_to_website.py: 设备outbox与持续直传。
README.md、docs/DEVICE_UPLOAD.md、.env.example: 交付和接入说明。
tests/: 上传幂等性、权限隔离、错误与恢复、浏览器登录和流程。

## 验收

隔离环境三张上传形成唯一组，重复请求不重复组图，冲突拒绝；不同设备隔离；服务重启仍保留数据；未登录不能读照片或修改配置，设备凭证不能调用管理接口；server模式不启动SSH或桌面扫描；现有回归通过。新设备先只读确认，再由相机发出测试图片验证上传，模型付费验证按已有授权执行。源码上传GitHub前检查凭据并记录实际硬件验证边界，不将模拟测试当作新设备实拍验收。
