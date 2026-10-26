# 完整本地运行资料的GitHub备份与恢复

## 备份交付

用户于2026-10-26明确授权将本地运行资料上传GitHub，作为运维已有Docker/Webhook部署的迁移来源。

- 源码已同步 `feature/device-upload-deployment`；本次数据快照的源码版本为 `c16967b75c11e22e545966e095a6fe3935cd4a2b`。
- GitHub Release： https://github.com/Allenkzl/CatApp/releases/tag/runtime-backup-20261026-c16967b
- 数据资产：`catapp-runtime-20261026-c16967b.tar.gz.enc`，约219MB（33张当前站照片、10篇作品记录，另含旧站数据、全部原始日志和私有配置）。
- 原始项目文件和运行目录按原内容归档，只排除`.git`、生成缓存与备份自身。API密钥、设备token、相机登录配置和完整日志均在加密包内，不做内容删改。
- 加密：OpenSSL AES-256-CBC，PBKDF2/SHA256，600000次迭代；解密后压缩包SHA256与加密前一致，并核对当前站每张照片文件均在包内。
- 包内当前站目录：`CatApp/.data/device-live/`。`CatApp/.data/`根目录还有旧本地站资料，两者不能混为同一份索引。
- `MANIFEST.json`记录文件大小、密文SHA256、快照版本与记录数；`SHA256SUMS`供下载校验。

仓库当前为公开状态，加密资产也可公开下载；解密口令单独存放，**不包含在Release、源码或备份中**。GitHub Actions Secret名称：

```text
CATAPP_BACKUP_PASSPHRASE_20261026_C16967B
```

本机另存口令：`artifacts/github-runtime-backup/decryption-passphrase.txt`，权限0600，仅通过公司私密渠道交给运维。GitHub Secrets不能直接读回明文；已有外部Webhook如果不运行在GitHub Actions，需运维在其私密配置中设置口令，或使用这份本机口令文件。

## 与现有Webhook的关系

源码推送可以触发已有自动构建流程。运行资料是独立Release资产，不会自动进入Docker镜像或现有挂载目录；当前`.dockerignore`有意排除`.data`，镜像也只COPY程序文件。

本次不修改运维的自动部署流程、不擅自覆盖服务器数据。运维需要首次执行以下恢复，或者将同样步骤接入其受控迁移流程。**不要每次Webhook构建都重新导入旧备份**，否则会覆盖上线后新增的数据。

## 下载和解密

在受限目录操作，先核实生产环境备份已完成；以下步骤仅在空的临时恢复目录解包，不直接写正式挂载目录。

```bash
umask 077
mkdir -p catapp-restore
cd catapp-restore
gh release download runtime-backup-20261026-c16967b --repo Allenkzl/CatApp \
  --pattern '*.enc' --pattern 'MANIFEST.json' --pattern 'SHA256SUMS' --pattern 'RESTORE.md'
sha256sum -c SHA256SUMS
# 运维将口令文件安全放到 /secure/catapp-backup-passphrase.txt，权限0600。
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -in catapp-runtime-20261026-c16967b.tar.gz.enc \
  -out catapp-runtime.tar.gz -pass file:/secure/catapp-backup-passphrase.txt
tar --no-same-owner -xzf catapp-runtime.tar.gz
```

在GitHub Actions内也可以将上述Secret映射为环境变量`CATAPP_BACKUP_PASSPHRASE`，使用 `-pass env:CATAPP_BACKUP_PASSPHRASE` 解密，不把口令打印到控制台。不要将口令作为命令行明文参数。

解包目录包含真实密码和密钥，限制目录权限，不放到Nginx静态目录，不在工作流日志中cat这些配置文件。

## 导入服务器持久化目录

1. 停止仅本项目的生产采集上传，等待正在进行的故事/绘图请求结束；备份生产数据和配置，再停止该网站容器。
2. 将解包的 `CatApp/.data/device-live/` **内容**复制到一个新的空持久化目录，例如 `/srv/catapp/data-from-local-20261026/`。不要把整个外层`.data`或它的嵌套目录直接铺进正在使用的线上目录。
3. 记录包内33张照片、10篇作品记录为本次快照基线。作品包含原有失败状态，不能把“作品记录数”当成“成功漫画数”；保留失败和付费输出缓存，避免重复付费。
4. 设置该专用目录及内容的UID/GID为容器用户1000:1000，并确保可读写。修改服务器的 `CAT_HOST_DATA_DIR` 指向新目录，容器内仍为 `/app/data`。
5. 将必要运行凭据放入运维私密环境配置。快照中的 `CatApp/.data/server-local-env.json` 包含本地实际模型配置、管理员和初始设备凭据；可作为迁移来源，**不能整份直接用作服务器启动环境**。正式服务器保留自己的域名、端口、数据路径和登录策略。需要迁移的模型变量为 `DEEPSEEK_API_KEY`、`SEEDREAM_API_KEY`、`SEEDREAM_MODEL`。
6. 设备凭证需要单独核对：若持久化目录中有`devices.json`，保留其已有哈希，轮换后的持久化凭证优先。若当前设备只通过本地 `CAT_DEVICE_ID` / `CAT_DEVICE_TOKEN` 预置而未落盘，需运维将这两个变量接入服务运行环境（当前Compose模板未透传），或者在新数据目录生成对应设备ID与token的SHA256哈希记录。不要用注册同名设备来“导入”，因为会生成新token，使相机旧凭证失效。
7. 当前Compose默认关闭付费生成，核实凭据、账户模型权限及余额后再显式开启`CAT_AUTO_GENERATE=true`。先验证历史原图/漫画，再允许新请求；不要自动重试原有失败任务。
8. 启动容器，检查健康接口、登录、历史照片、作品预览和PNG下载。确认无误后，将相机`website_url`改为服务器正式HTTPS域名，保持正确设备凭证，验证三张新抓拍和漫画生成。
9. 通过后再恢复生产采集；保留旧目录供回滚。原生产站如有本地快照之后新增的数据，需要另行确认补录，不能直接拼接多个`captures.json`。

### 本次快照的设备凭证导入

已核实本次当前站没有`devices.json`，设备凭证由本地环境预置。为保持相机现有token有效，运维可以在新持久化目录复制完成后、启动容器前执行下面的离线转换。它只把原token的SHA256哈希写入设备索引，不打印或更换token。将目标目录替换为实际新目录；此处不是正在使用的旧生产目录。

```bash
python3 - <<'PYTHON'
from pathlib import Path
import json,hashlib,os
source=Path('CatApp/.data/server-local-env.json')
target=Path('/srv/catapp/data-from-local-20261026/devices.json')
config=json.loads(source.read_text())
device_id=config.get('CAT_DEVICE_ID')
token=config.get('CAT_DEVICE_TOKEN')
if not device_id or not token:
    raise SystemExit('Initial device credentials missing; stop and inspect private configuration')
if not target.parent.is_dir():
    raise SystemExit('Restore the dedicated data directory first')
records=json.loads(target.read_text()) if target.exists() else []
if not any(record['id']==device_id for record in records):
    records.append({'id':device_id,'tokenHash':hashlib.sha256(token.encode()).hexdigest()})
    temporary=target.with_suffix('.tmp')
    temporary.write_text(json.dumps(records))
    os.chmod(temporary,0o600)
    temporary.replace(target)
print('Device credential record is ready; no token printed or rotated')
PYTHON
```

执行后按前面的容器UID/GID要求调整专用数据目录权限。此步骤不需要向当前Compose新增明文设备token变量。

加密包还保留本机PID、旧地址和历史日志供排障。这些文件是快照证据，不应作为生产进程身份或当前网络配置。当前浏览器localStorage/IndexedDB中的旧原型演示资料不属于服务器文件，本包不声称备份了浏览器存储。

## 完成标准

源码版本可追溯；新服务器正确读取迁移目录；历史照片/漫画可见；设备凭证有效；新照片可入库并按设定组图；模型请求正常；容器替换后数据仍在。只有运维完成这次导入与验收，才可以说云端已恢复了本地业务数据和运行效果。
