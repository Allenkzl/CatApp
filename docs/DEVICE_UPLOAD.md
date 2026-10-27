# reCamera Pro 直接上传照片

## 数据接口

`POST /api/device/photos`

- `Authorization: Bearer <专用设备凭证>`，不要使用DeepSeek/Seedream密钥。
- `Content-Type: image/jpeg`，请求体为原始JPEG文件，最多30MB。
- `X-Catapp-Photo-Id`：设备内唯一且重试保持不变的ID，1–128位字母数字/点/下划线/连字符。
- `X-Catapp-Captured-At`：含时区的ISO8601拍摄时间，例如 `2026-10-21T10:00:00+08:00`。

后端由凭证确定deviceId，不能通过请求伪装其他设备。首次成功返回201 `{accepted:true,photoId,duplicate:false}`；同设备同ID、相同图片和时间重传返回200及相同photoId；同ID冲突返回409。只有获得成功ACK后才能把本地项目outbox中的文件移走。401/403需要修正凭证；429/5xx及网络故障稍后重试。每设备60请求/分钟（含心跳）。

`POST /api/device/heartbeat` 使用同一Bearer凭证，无请求体；可带 `X-Catapp-State: watching` 表明检测流近期正常。超过30秒没有活动显示离线；网络连接与检测状态分别展示。

## 首次部署到相机

先核实新设备IP、SSH账户、固件、Python和websockets。当前现场核实的设备为192.168.50.94，root账户、Python3.11.6、websockets10.4；不要假设其他设备完全相同。

1. 登录网站空间设置，为相机生成独立设备ID及上传凭证。
2. 在设备创建 `/userdata/catapp-uploader/`，复制两个文件到此目录：
   - `scripts/recamera/camera_collect.py`（已有本机Camera API与猫出现门控）
   - `scripts/recamera/upload_to_website.py`（独立outbox及HTTP客户端）
3. 把设置页提供的JSON保存为设备私有的 `config.json`，权限0600。示意（不是可用凭证）：

```json
{
  "website_url": "https://cats.example.com",
  "device_id": "recamera-pro-01",
  "token": "REPLACE_WITH_DEVICE_TOKEN",
  "interval": 5,
  "absence": 2,
  "periodic": 30,
  "threshold": 0.3,
  "max_pending": 100
}
```

4. 确认原猫观察采集进程已正常停止，避免竞争同一相机API。此工具共用 `/userdata/recamera-cat-observation/collector.lock`，先创建该目录。不要停止其他GPIO或模型服务。
5. 在设备启动：

```bash
python3 -u /userdata/catapp-uploader/upload_to_website.py --config /userdata/catapp-uploader/config.json
```

后台运行和开机启动由运维按现场设备系统配置，本轮没有安装系统启动项。首次部署可通过SSH，日常数据传输不使用SSH。

局域网明确测试可设置 `website_url: http://电脑局域网IP:端口` 并加 `allow_http_lan: true`。相机中的localhost是相机自己；不能填电脑上的 `http://localhost:4173`。网站需监听局域网地址，且防火墙允许访问。正式部署使用HTTPS并验证证书，不关闭服务器证书校验。

## 拍摄和恢复

猫检测阈值默认0.3；离开至少2秒后重新允许触发，最少间隔5秒；一直在画面里每30秒补拍。按真实检测帧判断离开，不把断网当作猫消失。

图片和固定photoId先写 `/mnt/rc_mmcblk0p8/catapp_upload/`。上传任务与检测任务分开运行，断网保留outbox；默认100张待传上限，到上限暂停新增抓拍。成功ACK后只清理本项目outbox文件。检测设备余量不足200MB时拒绝拍照，不删除其他业务文件。凭证错误停止上传，修正后重新启动；日志不打印凭证。

## 隔离传输验收

可对一个关闭付费生成、独立数据目录的测试后台运行 `--snapshot`，它会进行一次明确的无条件抓拍并上传，不能把它当作检测到猫或完整漫画链路验收。验收照片不能混入正式下一组猫照片。

本轮已完成新相机一次真实抓拍→HTTP上传→后台ACK，使用独立目录与测试端口。完整三张猫图片现场测试仍需用户展示猫画面后验收；隔离软件测试覆盖三张组图、重复上传和重启恢复。

## 云端 HTTPS 上传排障（2026-10-27）

- 部分设备 Python 的 OpenSSL 默认 CA 路径指向构建机目录，导致 `CERTIFICATE_VERIFY_FAILED`。配置可选的 `ca_file`，指向设备上的可信 PEM CA 集合；始终保留证书和主机名验证。相机本轮使用 `/userdata/catapp-uploader/trusted-ca.pem`，迁移配置时须一并保留该文件。
- 云端网关拒绝 `Python-urllib` 默认客户端标识，返回 HTTP 403 / error code 1010。上传器现明确发送 `User-Agent: CatApp-reCamera/1.0`；已在相机本机验证云端心跳 200。
- 真实抓拍向正式站上传返回 HTTP 413，未入库。相机原图约 1.28–1.33 MB；需运维核对所有反向代理/Ingress 的请求体限制，将本项目图片上传上限设为 30 MB。仓库 `deploy/nginx.conf.example` 已包含 `client_max_body_size 30m;`，但仅修改仓库模板不会改变正在运行的外部代理。Nginx 修改后先 `nginx -t`，通过后 reload；其他代理使用对应配置。
- 截至本轮结束，相机已回退本地 `http://192.168.6.245:4180` 持续上传；云端已登记设备，但没有照片入库，不能称为云端上传成功。设备配置和程序的 `before-cloud-*` 备份留在设备目录，本机云端凭证保存在忽略的 `.data/cloud-camera-config.json`。
- 运维调整后：部署本分支上传器，恢复云端配置（含设备 token 与 ca_file），仅保留一个采集进程；先显式单张抓拍，确认 201/ACK、云端照片数量增加、原图可读取，再启动持续猫识别上传。当前云端模型密钥未配置；照片上传成功也不等于自动漫画已经可用。
