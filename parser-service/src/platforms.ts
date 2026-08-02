import type { Page } from "playwright";
import type { MediaItem, Platform } from "./types.js";

export interface PageSnapshot {
  title: string;
  description: string;
  author: string;
  publishedAt: string;
  bodyText: string;
  images: string[];
  videos: string[];
  scripts: string[];
  jsonLd: string[];
}

export interface PlatformAdapter {
  platform: Platform;
  matches(host: string): boolean;
  extract(snapshot: PageSnapshot, pageUrl: string): {
    title: string;
    author: string;
    content: string;
    publishedAt: string;
    tags: string[];
    media: MediaItem[];
  };
}

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();

const dedupe = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

function absoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function extensionFor(url: string, fallback: string): string {
  try {
    const extension = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (extension && ["jpg", "jpeg", "png", "webp", "avif", "gif", "mp4", "webm", "m3u8"].includes(extension)) return extension;
  } catch {
    // Use the media-type fallback.
  }
  return fallback;
}

function mediaFromSnapshot(snapshot: PageSnapshot, pageUrl: string, platform: Platform): MediaItem[] {
  const images = dedupe(snapshot.images.map((url) => absoluteUrl(url, pageUrl)))
    .filter((url) => /^https?:\/\//i.test(url));
  const videos = dedupe(snapshot.videos.map((url) => absoluteUrl(url, pageUrl)))
    .filter((url) => /^https?:\/\//i.test(url));
  const result: MediaItem[] = [];
  images.slice(0, 30).forEach((url, index) => result.push({
    id: `image-${index + 1}`,
    type: "image",
    sourceUrl: url,
    filename: `image-${index + 1}.${extensionFor(url, "jpg")}`
  }));
  videos.slice(0, 3).forEach((url, index) => result.push({
    id: `video-${index + 1}`,
    type: "video",
    sourceUrl: url,
    filename: `video-${index + 1}.${extensionFor(url, "mp4")}`
  }));
  return result;
}

function jsonLdFields(snapshot: PageSnapshot): { title?: string; author?: string; content?: string; publishedAt?: string; images: string[]; videos: string[] } {
  const output: { title?: string; author?: string; content?: string; publishedAt?: string; images: string[]; videos: string[] } = { images: [], videos: [] };
  for (const raw of snapshot.jsonLd) {
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        if (typeof item.headline === "string") output.title ??= clean(item.headline);
        if (typeof item.articleBody === "string") output.content ??= clean(item.articleBody);
        if (typeof item.datePublished === "string") output.publishedAt ??= item.datePublished;
        if (typeof item.author === "string") output.author ??= clean(item.author);
        if (item.author && typeof item.author === "object" && typeof (item.author as Record<string, unknown>).name === "string") {
          output.author ??= clean(String((item.author as Record<string, unknown>).name));
        }
        if (typeof item.image === "string") output.images.push(item.image);
        if (Array.isArray(item.image)) output.images.push(...item.image.filter((v): v is string => typeof v === "string"));
        const video = item.video as Record<string, unknown> | undefined;
        if (video && typeof video.contentUrl === "string") output.videos.push(video.contentUrl);
      }
    } catch {
      // Some pages include malformed JSON-LD; DOM metadata remains usable.
    }
  }
  return output;
}

function genericExtract(snapshot: PageSnapshot, pageUrl: string, platform: Platform) {
  const structured = jsonLdFields(snapshot);
  const content = structured.content || snapshot.description || snapshot.bodyText;
  const title = structured.title || snapshot.title || `${platform} 收藏`;
  const media = mediaFromSnapshot({
    ...snapshot,
    images: [...structured.images, ...snapshot.images],
    videos: [...structured.videos, ...snapshot.videos]
  }, pageUrl, platform);
  return {
    title: clean(title).slice(0, 200),
    author: clean(structured.author || snapshot.author).slice(0, 100),
    content: clean(content).slice(0, 30000),
    publishedAt: structured.publishedAt || snapshot.publishedAt,
    tags: [],
    media
  };
}

function scriptField(scripts: string[], keys: string[]): string {
  const pattern = new RegExp(`(?:["'])(?:${keys.join("|")})(?:["'])\\s*:\\s*(?:["'])(.*?)(?:["'])`, "i");
  for (const script of scripts) {
    const match = script.match(pattern);
    if (match?.[1]) return clean(match[1].replace(/\\["']/g, "\"").replace(/\\n/g, "\\n"));
  }
  return "";
}

function hashtags(content: string): string[] {
  return dedupe([...content.matchAll(/#([^#\s，。！？!?]{1,30})/g)].map((match) => match[1].trim()));
}

const xhsAdapter: PlatformAdapter = {
  platform: "小红书",
  matches: (host) => host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com" || host.endsWith(".xhslink.com") || host === "xhslink.cn" || host.endsWith(".xhslink.cn"),
  extract: (snapshot, pageUrl) => {
    const result = genericExtract(snapshot, pageUrl, "小红书");
    const content = scriptField(snapshot.scripts, ["desc", "noteDesc", "description", "content"]) || result.content;
    return {
      ...result,
      title: scriptField(snapshot.scripts, ["title", "noteTitle", "displayTitle"]) || result.title,
      author: scriptField(snapshot.scripts, ["nickname", "userName", "author"]) || result.author,
      content,
      tags: hashtags(content)
    };
  }
};

const douyinAdapter: PlatformAdapter = {
  platform: "抖音",
  matches: (host) => host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com"),
  extract: (snapshot, pageUrl) => {
    const result = genericExtract(snapshot, pageUrl, "抖音");
    const content = scriptField(snapshot.scripts, ["desc", "description", "content", "title"]) || result.content;
    return {
      ...result,
      title: scriptField(snapshot.scripts, ["desc", "title"]) || result.title,
      author: scriptField(snapshot.scripts, ["nickname", "author", "unique_id"]) || result.author,
      content,
      tags: hashtags(content)
    };
  }
};

export const adapters: PlatformAdapter[] = [xhsAdapter, douyinAdapter];

export function adapterForUrl(url: string): PlatformAdapter | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return adapters.find((adapter) => adapter.matches(host));
  } catch {
    return undefined;
  }
}

export async function snapshotPage(page: Page): Promise<PageSnapshot> {
  // Pass a plain JavaScript string so tsx/esbuild helpers never leak into the page context.
  return page.evaluate(`(() => {
    const meta = (selector) => document.querySelector(selector)?.content?.trim() || "";
    const text = (selector) => document.querySelector(selector)?.innerText?.trim() || "";
    const images = Array.from(document.images).map((image) => image.currentSrc || image.src || image.getAttribute("data-src") || "");
    const videos = Array.from(document.querySelectorAll("video")).map((video) => video.currentSrc || video.src || "");
    const sources = Array.from(document.querySelectorAll("video source")).map((source) => source.src || source.getAttribute("src") || "");
    const scripts = Array.from(document.scripts).map((script) => script.textContent || "").filter((value) => value.length > 0).slice(0, 40);
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => script.textContent || "");
    const body = text("article") || text("main") || document.body?.innerText || "";
    return {
      title: meta('meta[property="og:title"]') || document.title || "",
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
      author: meta('meta[name="author"]'),
      publishedAt: meta('meta[property="article:published_time"]'),
      bodyText: body,
      images: [meta('meta[property="og:image"]'), ...images],
      videos: [meta('meta[property="og:video"]'), ...videos, ...sources],
      scripts,
      jsonLd
    };
  })()`);
}

export function addScriptMediaCandidates(snapshot: PageSnapshot): PageSnapshot {
  const imageCandidates: string[] = [];
  const videoCandidates: string[] = [];
  const pattern = /https?:\/\/[^"'<>\s\\]+/g;
  for (const script of snapshot.scripts) {
    const normalizedScript = script.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    for (const raw of normalizedScript.match(pattern) || []) {
      const url = raw;
      if (/\.(?:jpg|jpeg|png|webp|avif)(?:\?|$)/i.test(url) || /(?:xhscdn|douyinpic|image)/i.test(url)) imageCandidates.push(url);
      if (/\.(?:mp4|m3u8)(?:\?|$)/i.test(url) || /(?:douyinvod|video|playwm)/i.test(url)) videoCandidates.push(url);
    }
  }
  return { ...snapshot, images: [...snapshot.images, ...imageCandidates], videos: [...snapshot.videos, ...videoCandidates] };
}
