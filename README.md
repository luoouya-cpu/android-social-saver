# Android Social Saver

这是一个 Android 优先的 Obsidian 插件 MVP：接收小红书或抖音链接，并在当前库中创建 Markdown 收藏笔记。

## 当前功能

- 支持 `obsidian://save-social?url=...` 协议调用
- 支持从剪贴板保存链接
- 自动识别小红书/抖音
- 自动创建 `收集/社交媒体` 目录
- 自动写入 YAML、标签和原始链接
- 按原始 URL 去重
- 可选连接 NAS 解析服务，自动提取正文、图片和视频
- 解析失败时仍保底保存原始链接

## Android 分享入口

纯 JS 的 Obsidian 插件无法可靠地向 Android 系统注册原生分享目标，所以项目同时提供了一个很薄的 Android companion APK 源码。它注册为 Android 的文本分享目标，收到链接后打开：

```text
obsidian://save-social?url=URL编码后的链接
```

安装 companion APK 后，在小红书/抖音中点“分享”→“保存到 Obsidian”即可。

## 配置 NAS 解析服务

解析服务位于 `parser-service`，适合部署到 NAS Docker。第一阶段要求手机和 NAS 在同一 Wi‑Fi：

```bash
cd parser-service
# 编辑 docker-compose.yml：将 API_TOKEN 改成至少 32 位的随机字符串，
# 并确认端口绑定使用 NAS 的固定局域网 IP。
docker compose up -d --build
```

在 Obsidian 插件设置中填写：

- 解析服务地址：`http://NAS内网IP:3000`
- API Token：`.env` 中的 `API_TOKEN`
- 下载图片/视频：按需开启
- 视频大小上限：默认 50 MB，手机端最高 50 MB

服务健康检查：

```text
http://NAS内网IP:3000/health
```

当解析服务地址留空时，插件继续使用原来的链接保存模式。解析服务不可用或平台要求登录时，插件会创建 `status: needs-review` 的保底笔记。

NAS 部署前可执行 `uname -m` 检查架构。`x86_64` 兼容性最好；ARM NAS 需要先确认 NAS 的 Docker/Chromium 支持情况。不要把 3000 端口映射到公网。

## 构建

```bash
npm install
npm run build
```

将 `manifest.json`、`main.js`、`styles.css` 放到库的 `.obsidian/plugins/android-social-saver/` 目录，然后在 Obsidian 设置中启用插件。Obsidian 的示范插件也采用这三个文件作为手动安装/发布时的标准插件文件。

## 构建 Android APK

最简单的方式是使用 GitHub Actions：将项目上传到 GitHub，在仓库的 **Actions** 页面运行 **Build Android companion APK**，完成后从构建结果的 **Artifacts** 下载 `AndroidSocialSaver-debug`，解压得到 APK 并安装到手机。

如果电脑已经安装 Android Studio/Gradle，也可以在 PowerShell 中运行：

```powershell
.\android-companion\build.ps1
```

脚本会在项目根目录生成 `AndroidSocialSaver-debug.apk`。安装 APK 后，第一次使用前请先打开 Obsidian，让插件完成注册。
