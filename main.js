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
  includeTimestamp: true
};
function platformFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com" || host.endsWith(".xhslink.com")) return "\u5C0F\u7EA2\u4E66";
    if (host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "\u6296\u97F3";
  } catch {
  }
  return "\u5176\u4ED6";
}
function safeName(value) {
  return value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "\u672A\u547D\u540D\u6536\u85CF";
}
function dateParts(date = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const stamp = `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { day, stamp };
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
      new import_obsidian.Notice("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u4FDD\u5B58\u76EE\u5F55\u548C Obsidian \u6743\u9650");
    });
    return this.saveQueue;
  }
  async saveUrlInternal(rawUrl) {
    const match = rawUrl.match(/https?:\/\/[^\s]+/i);
    const url = match?.[0]?.replace(/[),.;!?]+$/, "");
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
    const { day, stamp } = dateParts();
    const folder = (0, import_obsidian.normalizePath)(this.settings.folder.trim() || "\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53");
    await this.ensureFolder(folder);
    const baseName = safeName(`${platform}-${day}-${url.slice(-12)}`);
    let path = (0, import_obsidian.normalizePath)(`${folder}/${baseName}.md`);
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = (0, import_obsidian.normalizePath)(`${folder}/${baseName}-${suffix}.md`);
      suffix += 1;
    }
    const tags = this.settings.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `source: ${JSON.stringify(platform)}`,
      `url: ${JSON.stringify(url)}`,
      `saved_at: ${JSON.stringify((/* @__PURE__ */ new Date()).toISOString())}`,
      ...tags.length ? [`tags: ${JSON.stringify(tags)}`] : [],
      "status: inbox",
      "---"
    ].join("\n");
    const title = `${platform} \u6536\u85CF ${day}`;
    const body = `${frontmatter}

# ${title}

\u539F\u59CB\u94FE\u63A5\uFF1A${url}

## \u5185\u5BB9

\uFF08\u540E\u7EED\u53EF\u5728\u8FD9\u91CC\u8865\u5145\u6458\u8981\u3001\u56FE\u7247\u6216\u89C6\u9891\u8BF4\u660E\u3002\uFF09

${this.settings.includeTimestamp ? `\u4FDD\u5B58\u65F6\u95F4\uFF1A${stamp}
` : ""}`;
    await this.app.vault.create(path, body);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    new import_obsidian.Notice(`\u5DF2\u4FDD\u5B58\u5230\uFF1A${path}`);
  }
  async hasSavedUrl(url) {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const match = content.match(/^url:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (match?.[1] === url) return true;
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
    new import_obsidian.Setting(containerEl).setName("\u4FDD\u5B58\u76EE\u5F55").setDesc("\u76F8\u5BF9\u4E8E\u5F53\u524D\u5E93\u7684\u8DEF\u5F84").addText((text) => text.setPlaceholder("\u6536\u96C6/\u793E\u4EA4\u5A92\u4F53").setValue(this.plugin.settings.folder).onChange(async (value) => {
      this.plugin.settings.folder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u6807\u7B7E").setDesc("\u4F7F\u7528\u82F1\u6587\u9017\u53F7\u5206\u9694").addText((text) => text.setValue(this.plugin.settings.tags).onChange(async (value) => {
      this.plugin.settings.tags = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u5199\u5165\u4FDD\u5B58\u65F6\u95F4").addToggle((toggle) => toggle.setValue(this.plugin.settings.includeTimestamp).onChange(async (value) => {
      this.plugin.settings.includeTimestamp = value;
      await this.plugin.saveSettings();
    }));
  }
};
