# 可转发给运维同事的消息

麻烦协助部署 CatApp 猫咪观测与漫画网站，目前设备直传、按张数组图、DeepSeek英文故事及Seedream漫画流程已由业务方测试通过。

- 源码：https://github.com/Allenkzl/CatApp （2026-10-26核实为公开仓库；如后续改为私有，需由仓库所有者授权）。部署分支为 feature/device-upload-deployment，具体commit见交接包 SOURCE_VERSION.txt。
- 交付包含Dockerfile、Compose、配置模板、Nginx示例、设备脚本和完整部署说明 docs/OPS_HANDOFF.md。包内不含已构建镜像，需在目标架构构建并运行隔离容器验证；本机没有Docker，尚未完成容器实测。
- 单实例部署即可，不需要数据库服务或GPU；程序使用文件目录及JSON索引。
- 需要一个HTTPS域名、服务器持久化目录（例 /srv/catapp/data → 容器 /app/data，UID/GID 1000:1000）、独立备份及外网API访问能力。
- 管理员密码、DeepSeek与方舟密钥通过安全渠道单独提供，不包含在交接包中。网站默认先关闭付费生成，基础检查通过后按说明显式开启。
- 请先确认主机架构、正式域名、数据与备份位置、镜像交付方式，以及是否迁移现有照片漫画。建议初次使用独立空库。
- 网站部署后需要将相机上传地址改成正式域名、配置对应设备token及采集守护，联合验收三张照片到完整漫画；通过后再停电脑测试站。

请按 docs/OPS_HANDOFF.md 完成构建、配置、HTTPS、持久化/恢复验证及业务验收，并回传版本、地址和验收结果，不发送任何密钥。
