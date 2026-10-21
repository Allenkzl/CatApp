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
