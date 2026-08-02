import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";

interface SocialSaverSettings {
  folder: string;
  tags: string;
  includeTimestamp: boolean;
}

const DEFAULT_SETTINGS: SocialSaverSettings = {
  folder: "收集/社交媒体",
  tags: "收藏,待整理",
  includeTimestamp: true
};

function platformFor(url: string): "小红书" | "抖音" | "其他" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") ||
        host === "xhslink.com" || host.endsWith(".xhslink.com") ||
        host === "xhslink.cn" || host.endsWith(".xhslink.cn")) return "小红书";
    if (host === "douyin.com" || host.endsWith(".douyin.com") ||
        host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "抖音";
  } catch {
    // The caller validates the URL and reports a useful error.
  }
  return "其他";
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "未命名收藏";
}

function dateParts(date = new Date()): { day: string; stamp: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const stamp = `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { day, stamp };
}

export default class AndroidSocialSaver extends Plugin {
  settings!: SocialSaverSettings;
  private saveQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "save-social-url-from-clipboard",
      name: "从剪贴板保存小红书/抖音链接",
      callback: async () => {
        try {
          const text = await navigator.clipboard?.readText();
          if (!text) {
            new Notice("剪贴板为空");
            return;
          }
          await this.saveUrl(text.trim());
        } catch (error) {
          console.error("读取剪贴板失败", error);
          new Notice("无法读取剪贴板，请检查系统权限");
        }
      }
    });

    // Android 分享入口通过 obsidian://save-social?url=... 调用此处理器。
    this.registerObsidianProtocolHandler("save-social", async (params) => {
      const url = params.url ?? params.text;
      if (url) await this.saveUrl(url);
      else new Notice("没有收到分享链接");
    });

    this.addSettingTab(new SocialSaverSettingTab(this.app, this));
  }

  async saveUrl(rawUrl: string): Promise<void> {
    // Android 分享可能连续触发，串行化可以避免两个请求同时创建同一个文件。
    this.saveQueue = this.saveQueue.then(() => this.saveUrlInternal(rawUrl)).catch((error: unknown) => {
      console.error("保存社交媒体链接失败", error);
      new Notice("保存失败，请检查保存目录和 Obsidian 权限");
    });
    return this.saveQueue;
  }

  private async saveUrlInternal(rawUrl: string): Promise<void> {
    // 小红书复制链接有时会省略协议，例如 xhslink.com/a/xxxx。
    const match = rawUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:xiaohongshu\.com|xhslink\.com|xhslink\.cn|douyin\.com|iesdouyin\.com)\/[^\s]+/i);
    let url = match?.[0]?.replace(/[),.;!?，。！？]+$/, "");
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!url) {
      new Notice("未找到有效链接");
      return;
    }

    const platform = platformFor(url);
    if (platform === "其他") {
      new Notice("目前只支持小红书和抖音链接");
      return;
    }

    if (await this.hasSavedUrl(url)) {
      new Notice("这个链接已经保存过了");
      return;
    }

    const { day, stamp } = dateParts();
    const folder = normalizePath(this.settings.folder.trim() || "收集/社交媒体");
    await this.ensureFolder(folder);
    const baseName = safeName(`${platform}-${day}-${url.slice(-12)}`);
    let path = normalizePath(`${folder}/${baseName}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${baseName}-${suffix}.md`);
      suffix += 1;
    }

    const tags = this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(platform)}`,
      `url: ${JSON.stringify(url)}`,
      `saved_at: ${JSON.stringify(new Date().toISOString())}`,
      ...(tags.length ? [`tags: ${JSON.stringify(tags)}`] : []),
      "status: inbox",
      "---"
    ].join("\n");
    const title = `${platform} 收藏 ${day}`;
    const body = `${frontmatter}\n\n# ${title}\n\n原始链接：${url}\n\n## 内容\n\n（后续可在这里补充摘要、图片或视频说明。）\n\n${this.settings.includeTimestamp ? `保存时间：${stamp}\n` : ""}`;
    await this.app.vault.create(path, body);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`已保存到：${path}`);
  }

  private async hasSavedUrl(url: string): Promise<boolean> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const match = content.match(/^url:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (match?.[1] === url) return true;
    }
    return false;
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }

  async loadSettings(): Promise<void> { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
}

class SocialSaverSettingTab extends PluginSettingTab {
  plugin: AndroidSocialSaver;

  constructor(app: App, plugin: AndroidSocialSaver) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("保存目录").setDesc("相对于当前库的路径").addText((text) => text
      .setPlaceholder("收集/社交媒体")
      .setValue(this.plugin.settings.folder)
      .onChange(async (value) => { this.plugin.settings.folder = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("默认标签").setDesc("使用英文逗号分隔").addText((text) => text
      .setValue(this.plugin.settings.tags)
      .onChange(async (value) => { this.plugin.settings.tags = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("写入保存时间").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.includeTimestamp)
      .onChange(async (value) => { this.plugin.settings.includeTimestamp = value; await this.plugin.saveSettings(); }));
  }
}
