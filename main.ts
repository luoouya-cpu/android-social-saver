import { App, Notice, Plugin, PluginSettingTab, requestUrl, Setting, TFile, normalizePath } from "obsidian";

type Platform = "小红书" | "抖音" | "其他";

interface CaptureMedia {
  id: string;
  type: "image" | "video";
  url: string;
  filename: string;
  size?: number;
  mimeType?: string;
}

interface CaptureResponse {
  status: "completed";
  jobId: string;
  platform: "小红书" | "抖音";
  canonicalUrl: string;
  title: string;
  author: string;
  content: string;
  publishedAt: string;
  tags: string[];
  media: CaptureMedia[];
  warnings: string[];
}

interface SocialSaverSettings {
  folder: string;
  tags: string;
  includeTimestamp: boolean;
  parserUrl: string;
  apiToken: string;
  downloadImages: boolean;
  downloadVideos: boolean;
  maxVideoMb: number;
  captureTimeoutSeconds: number;
}

const DEFAULT_SETTINGS: SocialSaverSettings = {
  folder: "收集/社交媒体",
  tags: "收藏,待整理",
  includeTimestamp: true,
  parserUrl: "",
  apiToken: "",
  downloadImages: true,
  downloadVideos: true,
  maxVideoMb: 50,
  captureTimeoutSeconds: 120
};

const MOBILE_MAX_VIDEO_MB = 50;
const API_REQUEST_TIMEOUT_MS = 30_000;

function platformFor(url: string): Platform {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") ||
        host === "xhslink.com" || host.endsWith(".xhslink.com") ||
        host === "xhslink.cn" || host.endsWith(".xhslink.cn")) return "小红书";
    if (host === "douyin.com" || host.endsWith(".douyin.com") ||
        host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "抖音";
  } catch {
    // The caller reports the invalid-link notice.
  }
  return "其他";
}

function extractUrl(rawUrl: string): string | undefined {
  const match = rawUrl.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.com|xhslink\.cn|douyin\.com|iesdouyin\.com)\/[^\s]+/i);
  if (!match) return undefined;
  const candidate = match[0].replace(/[),.;!?，。！？\]}>"'`]+$/, "");
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "未命名收藏";
}

function dateParts(date = new Date()): { day: string; stamp: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const stamp = `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { day, stamp };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function apiBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function displayPublishedAt(value: string): string {
  if (/^\d{10,13}$/.test(value)) {
    const milliseconds = Number(value.length === 10 ? `${value}000` : value);
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return dateParts(date).stamp;
  }
  return value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${action}超时`)), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
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

    this.registerObsidianProtocolHandler("save-social", async (params) => {
      const url = params.url ?? params.text;
      if (url) await this.saveUrl(url);
      else new Notice("没有收到分享链接");
    });

    this.addSettingTab(new SocialSaverSettingTab(this.app, this));
  }

  async saveUrl(rawUrl: string): Promise<void> {
    this.saveQueue = this.saveQueue.then(() => this.saveUrlInternal(rawUrl)).catch((error: unknown) => {
      console.error("保存社交媒体链接失败", error);
      new Notice("保存失败，请检查保存目录、解析服务和 Obsidian 权限");
    });
    return this.saveQueue;
  }

  private async saveUrlInternal(rawUrl: string): Promise<void> {
    const url = extractUrl(rawUrl);
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

    if (apiBase(this.settings.parserUrl)) {
      if (!this.settings.apiToken.trim()) {
        new Notice("请先在插件设置中填写 NAS API Token");
        return;
      }
      new Notice("正在解析正文和媒体，请稍候…");
      try {
        const capture = await this.captureRemote(url);
        if (capture.canonicalUrl && await this.hasSavedUrl(capture.canonicalUrl)) {
          new Notice("这个链接已经保存过了");
          return;
        }
        await this.createCapturedNote(url, capture);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "解析服务失败";
        console.error("解析服务失败", error);
        await this.createLinkNote(url, platform, message);
        new Notice(`解析失败，已保存原始链接：${message}`);
        return;
      }
    }

    await this.createLinkNote(url, platform);
  }

  private async captureRemote(url: string): Promise<CaptureResponse> {
    const base = apiBase(this.settings.parserUrl);
    const headers: Record<string, string> = {};
    if (this.settings.apiToken.trim()) headers.Authorization = `Bearer ${this.settings.apiToken.trim()}`;
    const start = await withTimeout(requestUrl({
      url: `${base}/v1/captures`,
      method: "POST",
      contentType: "application/json",
      headers,
      body: JSON.stringify({ url }),
      throw: false
    }), API_REQUEST_TIMEOUT_MS, "创建解析任务");
    if (start.status >= 400) throw new Error(this.apiError(start.json, start.status));
    const created = start.json as { jobId?: string; status?: string };
    if (!created.jobId) throw new Error("解析服务没有返回任务编号");
    const deadline = Date.now() + Math.max(10, this.settings.captureTimeoutSeconds) * 1000;
    while (Date.now() < deadline) {
      await sleep(2000);
      const remaining = Math.max(1_000, deadline - Date.now());
      const response = await withTimeout(
        requestUrl({ url: `${base}/v1/captures/${encodeURIComponent(created.jobId)}`, headers, throw: false }),
        Math.min(API_REQUEST_TIMEOUT_MS, remaining),
        "查询解析任务"
      );
      if (response.status >= 400) throw new Error(this.apiError(response.json, response.status));
      const status = response.json as { status?: string; error?: string; media?: CaptureMedia[] };
      if (status.status === "completed" && Array.isArray(status.media)) return status as CaptureResponse;
      if (status.status === "failed") throw new Error(status.error || "解析服务返回失败");
    }
    throw new Error("解析超时");
  }

  private apiError(value: unknown, status: number): string {
    if (value && typeof value === "object" && "error" in value) return String((value as { error: unknown }).error);
    return `解析服务 HTTP ${status}`;
  }

  private async createCapturedNote(originalUrl: string, capture: CaptureResponse): Promise<void> {
    const { day, stamp } = dateParts();
    const root = normalizePath(this.settings.folder.trim() || "收集/社交媒体");
    await this.ensureFolder(root);
    const base = safeName(`${capture.platform}-${day}-${capture.title || "收藏"}`);
    let itemFolder = normalizePath(`${root}/${base}`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(itemFolder)) {
      itemFolder = normalizePath(`${root}/${base}-${suffix}`);
      suffix += 1;
    }
    await this.ensureFolder(itemFolder);
    const warnings = [...(capture.warnings || [])];
    const imageRefs: string[] = [];
    const videoRefs: string[] = [];
    const createdMediaPaths: string[] = [];
    for (const media of capture.media || []) {
      if (media.type === "image" && !this.settings.downloadImages) continue;
      if (media.type === "video" && !this.settings.downloadVideos) continue;
      const maxVideoBytes = this.maxVideoBytes();
      if (media.type === "video" && (media.size || 0) > maxVideoBytes) {
        warnings.push(`视频 ${media.filename} 超过 ${Math.round(maxVideoBytes / 1024 / 1024)} MB，已跳过`);
        continue;
      }
      try {
        const folder = media.type === "image" ? "images" : "videos";
        await this.ensureFolder(`${itemFolder}/${folder}`);
        const filename = safeName(media.filename || `${media.id}.${media.type === "image" ? "jpg" : "mp4"}`);
        const mediaPath = await this.downloadMedia(media, `${itemFolder}/${folder}/${filename}`);
        createdMediaPaths.push(mediaPath);
        const relative = mediaPath.slice(itemFolder.length + 1);
        (media.type === "image" ? imageRefs : videoRefs).push(`![[${relative}]]`);
      } catch (error) {
        warnings.push(`媒体 ${media.filename} 下载失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }

    const tags = [...this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean), ...(capture.tags || [])]
      .filter((tag, index, all) => all.indexOf(tag) === index);
    const status = warnings.length ? "needs-review" : "captured";
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(capture.platform)}`,
      `url: ${JSON.stringify(originalUrl)}`,
      `canonical_url: ${JSON.stringify(capture.canonicalUrl)}`,
      `title: ${JSON.stringify(capture.title)}`,
      `author: ${JSON.stringify(capture.author || "")}`,
      `saved_at: ${JSON.stringify(new Date().toISOString())}`,
      `status: ${JSON.stringify(status)}`,
      ...(tags.length ? [`tags: ${JSON.stringify(tags)}`] : []),
      ...(warnings.length ? [`capture_error: ${JSON.stringify(warnings.join("；"))}`] : []),
      "---"
    ].join("\n");
    const sections = [
      `# ${capture.title || `${capture.platform} 收藏 ${day}`}`,
      capture.author ? `作者：${capture.author}` : "",
      capture.publishedAt ? `发布时间：${displayPublishedAt(capture.publishedAt)}` : "",
      "## 正文",
      capture.content || "（未能自动提取正文。）",
      ...(imageRefs.length ? ["## 图片", ...imageRefs] : []),
      ...(videoRefs.length ? ["## 视频", ...videoRefs] : []),
      "## 原始链接",
      originalUrl,
      ...(this.settings.includeTimestamp ? [`保存时间：${stamp}`] : [])
    ].filter(Boolean);
    const path = normalizePath(`${itemFolder}/${safeName(capture.title || `${capture.platform}-${day}`)}.md`);
    try {
      await this.app.vault.create(path, `${frontmatter}\n\n${sections.join("\n\n")}\n`);
    } catch (error) {
      for (const mediaPath of createdMediaPaths) {
        const mediaFile = this.app.vault.getAbstractFileByPath(mediaPath);
        if (mediaFile) {
          try { await this.app.vault.delete(mediaFile); } catch (cleanupError) { console.warn("Failed to clean up media after note creation failure", cleanupError); }
        }
      }
      throw error;
    }
    await this.openFile(path);
    new Notice(`已保存完整收藏：${path}`);
  }

  private async downloadMedia(media: CaptureMedia, requestedPath: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.settings.apiToken.trim()) headers.Authorization = `Bearer ${this.settings.apiToken.trim()}`;
    const max = media.type === "video" ? this.maxVideoBytes() : 30 * 1024 * 1024;
    if (media.size && media.size > max) throw new Error(`文件超过 ${Math.round(max / 1024 / 1024)} MB 限制`);
    const head = await withTimeout(requestUrl({ url: media.url, method: "HEAD", headers, throw: false }), API_REQUEST_TIMEOUT_MS, "检查媒体大小");
    const advertisedSize = Number(head.headers["content-length"] || head.headers["Content-Length"] || 0);
    if (head.status < 400 && advertisedSize > max) throw new Error(`鏂囦欢瓒呰繃 ${Math.round(max / 1024 / 1024)} MB 闄愬埗`);
    const response = await withTimeout(requestUrl({ url: media.url, headers, throw: false }), API_REQUEST_TIMEOUT_MS, "下载媒体");
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    const bytes = response.arrayBuffer.byteLength;
    if (bytes > max) throw new Error(`文件超过 ${Math.round(max / 1024 / 1024)} MB 限制`);
    let path = normalizePath(requestedPath);
    let suffix = 2;
    const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
    const stem = extension ? path.slice(0, -extension.length) : path;
    while (this.app.vault.getAbstractFileByPath(path)) { path = `${stem}-${suffix}${extension}`; suffix += 1; }
    await this.app.vault.createBinary(path, response.arrayBuffer);
    return path;
  }

  private maxVideoBytes(): number {
    return Math.min(Math.max(1, this.settings.maxVideoMb), MOBILE_MAX_VIDEO_MB) * 1024 * 1024;
  }

  private async createLinkNote(url: string, platform: "小红书" | "抖音", error?: string): Promise<void> {
    const { day, stamp } = dateParts();
    const root = normalizePath(this.settings.folder.trim() || "收集/社交媒体");
    await this.ensureFolder(root);
    const base = safeName(`${platform}-${day}`);
    let itemFolder = normalizePath(`${root}/${base}`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(itemFolder)) { itemFolder = normalizePath(`${root}/${base}-${suffix}`); suffix += 1; }
    await this.ensureFolder(itemFolder);
    const tags = this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(platform)}`,
      `url: ${JSON.stringify(url)}`,
      `saved_at: ${JSON.stringify(new Date().toISOString())}`,
      `status: ${JSON.stringify(error ? "needs-review" : "inbox")}`,
      ...(tags.length ? [`tags: ${JSON.stringify(tags)}`] : []),
      ...(error ? [`capture_error: ${JSON.stringify(error)}`] : []),
      "---"
    ].join("\n");
    const filename = safeName(`${platform}-${day}`);
    const path = normalizePath(`${itemFolder}/${filename}.md`);
    const body = `${frontmatter}\n\n# ${platform} 收藏 ${day}\n\n## 正文\n\n（解析服务未配置或暂时不可用。）\n\n## 原始链接\n\n${url}\n\n${this.settings.includeTimestamp ? `保存时间：${stamp}\n` : ""}`;
    await this.app.vault.create(path, body);
    await this.openFile(path);
    if (!error) new Notice(`已保存链接：${path}`);
  }

  private async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async hasSavedUrl(url: string): Promise<boolean> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const matches = [...content.matchAll(/^(?:url|canonical_url):\s*["']?([^"'\r\n]+)["']?\s*$/gm)];
      if (matches.some((match) => match[1] === url) && !/^status:\s*["']?needs-review["']?\s*$/m.test(content)) return true;
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

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.maxVideoMb = Math.min(Math.max(1, Number(this.settings.maxVideoMb) || DEFAULT_SETTINGS.maxVideoMb), MOBILE_MAX_VIDEO_MB);
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
}

class SocialSaverSettingTab extends PluginSettingTab {
  plugin: AndroidSocialSaver;

  constructor(app: App, plugin: AndroidSocialSaver) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("解析服务地址").setDesc("例如 http://192.168.1.20:3000；留空则只保存链接").addText((text) => text
      .setPlaceholder("http://192.168.1.20:3000").setValue(this.plugin.settings.parserUrl)
      .onChange(async (value) => { this.plugin.settings.parserUrl = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("API Token").setDesc("与 NAS 解析服务 .env 中的 API_TOKEN 一致").addText((text) => text
      .setPlaceholder("Bearer Token").setValue(this.plugin.settings.apiToken).then((component) => { component.inputEl.type = "password"; return component; })
      .onChange(async (value) => { this.plugin.settings.apiToken = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("保存目录").setDesc("相对于当前库的路径").addText((text) => text
      .setPlaceholder("收集/社交媒体").setValue(this.plugin.settings.folder)
      .onChange(async (value) => { this.plugin.settings.folder = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("默认标签").setDesc("使用英文逗号分隔").addText((text) => text
      .setValue(this.plugin.settings.tags).onChange(async (value) => { this.plugin.settings.tags = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("下载图片").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.downloadImages).onChange(async (value) => { this.plugin.settings.downloadImages = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("下载视频").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.downloadVideos).onChange(async (value) => { this.plugin.settings.downloadVideos = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("视频大小上限（MB，最高 50）").addText((text) => text
      .setValue(String(this.plugin.settings.maxVideoMb)).onChange(async (value) => {
        const parsed = Number(value); if (Number.isFinite(parsed) && parsed > 0) { this.plugin.settings.maxVideoMb = Math.min(parsed, MOBILE_MAX_VIDEO_MB); await this.plugin.saveSettings(); }
      }));
    new Setting(containerEl).setName("解析超时（秒）").addText((text) => text
      .setValue(String(this.plugin.settings.captureTimeoutSeconds)).onChange(async (value) => {
        const parsed = Number(value); if (Number.isFinite(parsed) && parsed >= 10) { this.plugin.settings.captureTimeoutSeconds = parsed; await this.plugin.saveSettings(); }
      }));
  }
}
