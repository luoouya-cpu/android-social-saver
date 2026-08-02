var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AndroidSocialSaver
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  folder: "\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53",
  tags: "\u6536\u85CF,\u5F85\u6574\u7406",
  includeTimestamp: true,
  parserUrl: "",
  apiToken: "",
  downloadImages: true,
  downloadVideos: true,
  maxVideoMb: 200,
  captureTimeoutSeconds: 120
};
function platformFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com" || host.endsWith(".xhslink.com") || host === "xhslink.cn" || host.endsWith(".xhslink.cn")) return "\u5C0F\u7EA2\u4E66";
    if (host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "\u6296\u97F3";
  } catch {
  }
  return "\u5176\u4ED6";
}
function extractUrl(rawUrl) {
  const match = rawUrl.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.com|xhslink\.cn|douyin\.com|iesdouyin\.com)\/[^\s]+/i);
  if (!match) return void 0;
  const candidate = match[0].replace(/[),.;!?，。！？]+$/, "");
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}
function safeName(value) {
  return value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "\u672A\u547D\u540D\u6536\u85CF";
}
function dateParts(date = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const stamp = `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { day, stamp };
}
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function apiBase(value) {
  return value.trim().replace(/\/+$/, "");
}
var AndroidSocialSaver = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.saveQueue = Promise.resolve();
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "save-social-url-from-clipboard",
      name: "\u4ECE\u526A\u8D34\u677F\u4FDD\u5B58\u5C0F\u7EA2\u4E66/\u6296\u97F3\u94FE\u63A5",
      callback: async () => {
        try {
          const text = await navigator.clipboard?.readText();
          if (!text) {
            new import_obsidian.Notice("\u526A\u8D34\u677F\u4E3A\u7A7A");
            return;
          }
          await this.saveUrl(text.trim());
        } catch (error) {
          console.error("\u8BFB\u53D6\u526A\u8D34\u677F\u5931\u8D25", error);
          new import_obsidian.Notice("\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u8BF7\u68C0\u67E5\u7CFB\u7EDF\u6743\u9650");
        }
      }
    });
    this.registerObsidianProtocolHandler("save-social", async (params) => {
      const url = params.url ?? params.text;
      if (url) await this.saveUrl(url);
      else new import_obsidian.Notice("\u6CA1\u6709\u6536\u5230\u5206\u4EAB\u94FE\u63A5");
    });
    this.addSettingTab(new SocialSaverSettingTab(this.app, this));
  }
  async saveUrl(rawUrl) {
    this.saveQueue = this.saveQueue.then(() => this.saveUrlInternal(rawUrl)).catch((error) => {
      console.error("\u4FDD\u5B58\u793E\u4EA4\u5A92\u4F53\u94FE\u63A5\u5931\u8D25", error);
      new import_obsidian.Notice("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u4FDD\u5B58\u76EE\u5F55\u3001\u89E3\u6790\u670D\u52A1\u548C Obsidian \u6743\u9650");
    });
    return this.saveQueue;
  }
  async saveUrlInternal(rawUrl) {
    const url = extractUrl(rawUrl);
    if (!url) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u6709\u6548\u94FE\u63A5");
      return;
    }
    const platform = platformFor(url);
    if (platform === "\u5176\u4ED6") {
      new import_obsidian.Notice("\u76EE\u524D\u53EA\u652F\u6301\u5C0F\u7EA2\u4E66\u548C\u6296\u97F3\u94FE\u63A5");
      return;
    }
    if (await this.hasSavedUrl(url)) {
      new import_obsidian.Notice("\u8FD9\u4E2A\u94FE\u63A5\u5DF2\u7ECF\u4FDD\u5B58\u8FC7\u4E86");
      return;
    }
    if (apiBase(this.settings.parserUrl)) {
      new import_obsidian.Notice("\u6B63\u5728\u89E3\u6790\u6B63\u6587\u548C\u5A92\u4F53\uFF0C\u8BF7\u7A0D\u5019\u2026");
      try {
        const capture = await this.captureRemote(url);
        if (capture.canonicalUrl && await this.hasSavedUrl(capture.canonicalUrl)) {
          new import_obsidian.Notice("\u8FD9\u4E2A\u94FE\u63A5\u5DF2\u7ECF\u4FDD\u5B58\u8FC7\u4E86");
          return;
        }
        await this.createCapturedNote(url, capture);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "\u89E3\u6790\u670D\u52A1\u5931\u8D25";
        console.error("\u89E3\u6790\u670D\u52A1\u5931\u8D25", error);
        await this.createLinkNote(url, platform, message);
        new import_obsidian.Notice(`\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u4FDD\u5B58\u539F\u59CB\u94FE\u63A5\uFF1A${message}`);
        return;
      }
    }
    await this.createLinkNote(url, platform);
  }
  async captureRemote(url) {
    const base = apiBase(this.settings.parserUrl);
    const headers = {};
    if (this.settings.apiToken.trim()) headers.Authorization = `Bearer ${this.settings.apiToken.trim()}`;
    const start = await (0, import_obsidian.requestUrl)({
      url: `${base}/v1/captures`,
      method: "POST",
      contentType: "application/json",
      headers,
      body: JSON.stringify({ url }),
      throw: false
    });
    if (start.status >= 400) throw new Error(this.apiError(start.json, start.status));
    const created = start.json;
    if (!created.jobId) throw new Error("\u89E3\u6790\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u4EFB\u52A1\u7F16\u53F7");
    const deadline = Date.now() + Math.max(10, this.settings.captureTimeoutSeconds) * 1e3;
    while (Date.now() < deadline) {
      await sleep(2e3);
      const response = await (0, import_obsidian.requestUrl)({ url: `${base}/v1/captures/${encodeURIComponent(created.jobId)}`, headers, throw: false });
      if (response.status >= 400) throw new Error(this.apiError(response.json, response.status));
      const status = response.json;
      if (status.status === "completed" && Array.isArray(status.media)) return status;
      if (status.status === "failed") throw new Error(status.error || "\u89E3\u6790\u670D\u52A1\u8FD4\u56DE\u5931\u8D25");
    }
    throw new Error("\u89E3\u6790\u8D85\u65F6");
  }
  apiError(value, status) {
    if (value && typeof value === "object" && "error" in value) return String(value.error);
    return `\u89E3\u6790\u670D\u52A1 HTTP ${status}`;
  }
  async createCapturedNote(originalUrl, capture) {
    const { day, stamp } = dateParts();
    const root = (0, import_obsidian.normalizePath)(this.settings.folder.trim() || "\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53");
    await this.ensureFolder(root);
    const base = safeName(`${capture.platform}-${day}-${capture.title || "\u6536\u85CF"}`);
    let itemFolder = (0, import_obsidian.normalizePath)(`${root}/${base}`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(itemFolder)) {
      itemFolder = (0, import_obsidian.normalizePath)(`${root}/${base}-${suffix}`);
      suffix += 1;
    }
    await this.ensureFolder(itemFolder);
    const warnings = [...capture.warnings || []];
    const imageRefs = [];
    const videoRefs = [];
    const createdMediaPaths = [];
    for (const media of capture.media || []) {
      if (media.type === "image" && !this.settings.downloadImages) continue;
      if (media.type === "video" && !this.settings.downloadVideos) continue;
      if (media.type === "video" && (media.size || 0) > this.settings.maxVideoMb * 1024 * 1024) {
        warnings.push(`\u89C6\u9891 ${media.filename} \u8D85\u8FC7 ${this.settings.maxVideoMb} MB\uFF0C\u5DF2\u8DF3\u8FC7`);
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
        warnings.push(`\u5A92\u4F53 ${media.filename} \u4E0B\u8F7D\u5931\u8D25\uFF1A${error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"}`);
      }
    }
    const tags = [...this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean), ...capture.tags || []].filter((tag, index, all) => all.indexOf(tag) === index);
    const status = warnings.length ? "needs-review" : "captured";
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(capture.platform)}`,
      `url: ${JSON.stringify(originalUrl)}`,
      `canonical_url: ${JSON.stringify(capture.canonicalUrl)}`,
      `title: ${JSON.stringify(capture.title)}`,
      `author: ${JSON.stringify(capture.author || "")}`,
      `saved_at: ${JSON.stringify((/* @__PURE__ */ new Date()).toISOString())}`,
      `status: ${JSON.stringify(status)}`,
      ...tags.length ? [`tags: ${JSON.stringify(tags)}`] : [],
      ...warnings.length ? [`capture_error: ${JSON.stringify(warnings.join("\uFF1B"))}`] : [],
      "---"
    ].join("\n");
    const sections = [
      `# ${capture.title || `${capture.platform} \u6536\u85CF ${day}`}`,
      capture.author ? `\u4F5C\u8005\uFF1A${capture.author}` : "",
      capture.publishedAt ? `\u53D1\u5E03\u65F6\u95F4\uFF1A${capture.publishedAt}` : "",
      "## \u6B63\u6587",
      capture.content || "\uFF08\u672A\u80FD\u81EA\u52A8\u63D0\u53D6\u6B63\u6587\u3002\uFF09",
      ...imageRefs.length ? ["## \u56FE\u7247", ...imageRefs] : [],
      ...videoRefs.length ? ["## \u89C6\u9891", ...videoRefs] : [],
      "## \u539F\u59CB\u94FE\u63A5",
      originalUrl,
      ...this.settings.includeTimestamp ? [`\u4FDD\u5B58\u65F6\u95F4\uFF1A${stamp}`] : []
    ].filter(Boolean);
    const path = (0, import_obsidian.normalizePath)(`${itemFolder}/${safeName(capture.title || `${capture.platform}-${day}`)}.md`);
    try {
      await this.app.vault.create(path, `${frontmatter}

${sections.join("\n\n")}
`);
    } catch (error) {
      for (const mediaPath of createdMediaPaths) {
        const mediaFile = this.app.vault.getAbstractFileByPath(mediaPath);
        if (mediaFile) {
          try {
            await this.app.vault.delete(mediaFile);
          } catch (cleanupError) {
            console.warn("Failed to clean up media after note creation failure", cleanupError);
          }
        }
      }
      throw error;
    }
    await this.openFile(path);
    new import_obsidian.Notice(`\u5DF2\u4FDD\u5B58\u5B8C\u6574\u6536\u85CF\uFF1A${path}`);
  }
  async downloadMedia(media, requestedPath) {
    const headers = {};
    if (this.settings.apiToken.trim()) headers.Authorization = `Bearer ${this.settings.apiToken.trim()}`;
    const max = media.type === "video" ? this.settings.maxVideoMb * 1024 * 1024 : 30 * 1024 * 1024;
    const head = await (0, import_obsidian.requestUrl)({ url: media.url, method: "HEAD", headers, throw: false });
    const advertisedSize = Number(head.headers["content-length"] || head.headers["Content-Length"] || 0);
    if (head.status < 400 && advertisedSize > max) throw new Error(`\u93C2\u56E6\u6B22\u74D2\u5470\u7E43 ${Math.round(max / 1024 / 1024)} MB \u95C4\u612C\u57D7`);
    const response = await (0, import_obsidian.requestUrl)({ url: media.url, headers, throw: false });
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    const bytes = response.arrayBuffer.byteLength;
    if (bytes > max) throw new Error(`\u6587\u4EF6\u8D85\u8FC7 ${Math.round(max / 1024 / 1024)} MB \u9650\u5236`);
    let path = (0, import_obsidian.normalizePath)(requestedPath);
    let suffix = 2;
    const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
    const stem = extension ? path.slice(0, -extension.length) : path;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    await this.app.vault.createBinary(path, response.arrayBuffer);
    return path;
  }
  async createLinkNote(url, platform, error) {
    const { day, stamp } = dateParts();
    const root = (0, import_obsidian.normalizePath)(this.settings.folder.trim() || "\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53");
    await this.ensureFolder(root);
    const base = safeName(`${platform}-${day}`);
    let itemFolder = (0, import_obsidian.normalizePath)(`${root}/${base}`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(itemFolder)) {
      itemFolder = (0, import_obsidian.normalizePath)(`${root}/${base}-${suffix}`);
      suffix += 1;
    }
    await this.ensureFolder(itemFolder);
    const tags = this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(platform)}`,
      `url: ${JSON.stringify(url)}`,
      `saved_at: ${JSON.stringify((/* @__PURE__ */ new Date()).toISOString())}`,
      `status: ${JSON.stringify(error ? "needs-review" : "inbox")}`,
      ...tags.length ? [`tags: ${JSON.stringify(tags)}`] : [],
      ...error ? [`capture_error: ${JSON.stringify(error)}`] : [],
      "---"
    ].join("\n");
    const filename = safeName(`${platform}-${day}`);
    const path = (0, import_obsidian.normalizePath)(`${itemFolder}/${filename}.md`);
    const body = `${frontmatter}

# ${platform} \u6536\u85CF ${day}

## \u6B63\u6587

\uFF08\u89E3\u6790\u670D\u52A1\u672A\u914D\u7F6E\u6216\u6682\u65F6\u4E0D\u53EF\u7528\u3002\uFF09

## \u539F\u59CB\u94FE\u63A5

${url}

${this.settings.includeTimestamp ? `\u4FDD\u5B58\u65F6\u95F4\uFF1A${stamp}
` : ""}`;
    await this.app.vault.create(path, body);
    await this.openFile(path);
    if (!error) new import_obsidian.Notice(`\u5DF2\u4FDD\u5B58\u94FE\u63A5\uFF1A${path}`);
  }
  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }
  async hasSavedUrl(url) {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const matches = [...content.matchAll(/^(?:url|canonical_url):\s*["']?([^"'\r\n]+)["']?\s*$/gm)];
      if (matches.some((match) => match[1] === url) && !/^status:\s*["']?needs-review["']?\s*$/m.test(content)) return true;
    }
    return false;
  }
  async ensureFolder(folder) {
    const parts = folder.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var SocialSaverSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u89E3\u6790\u670D\u52A1\u5730\u5740").setDesc("\u4F8B\u5982 http://192.168.1.20:3000\uFF1B\u7559\u7A7A\u5219\u53EA\u4FDD\u5B58\u94FE\u63A5").addText((text) => text.setPlaceholder("http://192.168.1.20:3000").setValue(this.plugin.settings.parserUrl).onChange(async (value) => {
      this.plugin.settings.parserUrl = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("API Token").setDesc("\u4E0E NAS \u89E3\u6790\u670D\u52A1 .env \u4E2D\u7684 API_TOKEN \u4E00\u81F4").addText((text) => text.setPlaceholder("Bearer Token").setValue(this.plugin.settings.apiToken).then((component) => {
      component.inputEl.type = "password";
      return component;
    }).onChange(async (value) => {
      this.plugin.settings.apiToken = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u4FDD\u5B58\u76EE\u5F55").setDesc("\u76F8\u5BF9\u4E8E\u5F53\u524D\u5E93\u7684\u8DEF\u5F84").addText((text) => text.setPlaceholder("\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53").setValue(this.plugin.settings.folder).onChange(async (value) => {
      this.plugin.settings.folder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u6807\u7B7E").setDesc("\u4F7F\u7528\u82F1\u6587\u9017\u53F7\u5206\u9694").addText((text) => text.setValue(this.plugin.settings.tags).onChange(async (value) => {
      this.plugin.settings.tags = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u4E0B\u8F7D\u56FE\u7247").addToggle((toggle) => toggle.setValue(this.plugin.settings.downloadImages).onChange(async (value) => {
      this.plugin.settings.downloadImages = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u4E0B\u8F7D\u89C6\u9891").addToggle((toggle) => toggle.setValue(this.plugin.settings.downloadVideos).onChange(async (value) => {
      this.plugin.settings.downloadVideos = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u89C6\u9891\u5927\u5C0F\u4E0A\u9650\uFF08MB\uFF09").addText((text) => text.setValue(String(this.plugin.settings.maxVideoMb)).onChange(async (value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.plugin.settings.maxVideoMb = parsed;
        await this.plugin.saveSettings();
      }
    }));
    new import_obsidian.Setting(containerEl).setName("\u89E3\u6790\u8D85\u65F6\uFF08\u79D2\uFF09").addText((text) => text.setValue(String(this.plugin.settings.captureTimeoutSeconds)).onChange(async (value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 10) {
        this.plugin.settings.captureTimeoutSeconds = parsed;
        await this.plugin.saveSettings();
      }
    }));
  }
};
