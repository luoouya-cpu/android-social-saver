# Android Social Saver

这是一个 Android 优先的 Obsidian 插件 MVP：接收小红书或抖音链接，并在当前库中创建 Markdown 收藏笔记。

## 当前功能

- 支持 `obsidian://save-social?url=...` 协议调用
- 支持从剪贴板保存链接
- 自动识别小红书/抖音
- 自动创建 `收集/社交媒体` 目录
- 自动写入 YAML、标签和原始链接
- 按原始 URL 去重
- 当前接收分享文本中的链接，尚未下载图片或视频

## Android 分享入口

纯 JS 的 Obsidian 插件无法可靠地向 Android 系统注册原生分享目标，所以项目同时提供了一个很薄的 Android companion APK 源码。它注册为 Android 的文本分享目标，收到链接后打开：

```text
obsidian://save-social?url=URL编码后的链接
```

安装 companion APK 后，在小红书/抖音中点“分享”→“保存到 Obsidian”即可。

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
