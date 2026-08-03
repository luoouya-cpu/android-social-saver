import { chromium, type Browser } from "playwright";
import { addScriptMediaCandidates, adapterForUrl, snapshotPage } from "./platforms.js";
import type { CaptureResult, MediaItem, Platform } from "./types.js";

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizedUrl(value: string): string | undefined {
  const match = value.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.com|xhslink\.cn|douyin\.com|iesdouyin\.com)\/[^\s]+/i);
  if (!match) return undefined;
  const candidate = match[0].replace(/[),.;!?，。！？\]}>"'`]+$/, "");
  const url = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  return isPublicHttpUrl(url) ? url : undefined;
}

function uniqueMedia(media: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return media.filter((item) => {
    if (!isPublicHttpUrl(item.sourceUrl) || seen.has(item.sourceUrl)) return false;
    seen.add(item.sourceUrl);
    return true;
  });
}

export class CaptureService {
  private browserPromise: Promise<Browser> | undefined;

  private browser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: true });
    return this.browserPromise;
  }

  async capture(input: string): Promise<CaptureResult> {
    const url = normalizedUrl(input);
    if (!url) throw new Error("仅支持有效的小红书或抖音公开链接");
    const adapter = adapterForUrl(url);
    if (!adapter) throw new Error("无法识别链接平台");
    const browser = await this.browser();
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
      locale: "zh-CN"
    });
    const page = await context.newPage();
    const warnings: string[] = [];
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (!response || response.status() >= 400) throw new Error(`页面返回 HTTP ${response?.status() ?? "未知"}`);
      await page.waitForTimeout(1_500);
      const finalUrl = page.url();
      if (!adapterForUrl(finalUrl)) throw new Error("链接跳转到了不受支持的域名");
      if (new URL(finalUrl).pathname === "/") {
        throw new Error("短链接没有跳转到具体笔记页面；可能已失效、需要登录或被平台拦截");
      }
      const snapshot = addScriptMediaCandidates(await snapshotPage(page));
      const extracted = adapter.extract(snapshot, finalUrl);
      const cookies = await context.cookies();
      const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      const origin = new URL(finalUrl).origin;
      const mediaHeaders: Record<string, string> = { Origin: origin };
      if (cookieHeader) mediaHeaders.Cookie = cookieHeader;
      if (!extracted.title && !extracted.content) warnings.push("页面未提取到正文，可能需要登录或触发了平台保护");
      if (!extracted.media.length) warnings.push("页面未提取到图片或视频");
      const media = uniqueMedia(extracted.media).map((item) => ({ ...item, requestHeaders: mediaHeaders }));
      return {
        status: "completed",
        platform: adapter.platform as Platform,
        canonicalUrl: finalUrl,
        title: extracted.title || `${adapter.platform} 收藏`,
        author: extracted.author,
        content: extracted.content,
        publishedAt: extracted.publishedAt,
        tags: extracted.tags,
        media,
        warnings
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    const browser = await this.browserPromise;
    await browser?.close();
  }
}
