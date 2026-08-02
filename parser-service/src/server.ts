import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CaptureService } from "./service.js";
import type { CaptureJob, CaptureResult, MediaItem } from "./types.js";

const port = Number(process.env.PORT || 3000);
const token = process.env.API_TOKEN || "";
const jobs = new Map<string, CaptureJob>();
const captureService = new CaptureService();
const maxBodyBytes = 64 * 1024;
const maxJobAge = 30 * 60 * 1000;
const maxConcurrentJobs = Math.max(1, Number(process.env.MAX_CONCURRENT_CAPTURES || 1));
const maxQueuedJobs = Math.max(1, Number(process.env.MAX_QUEUED_CAPTURES || 8));
const maxVideoBytes = Math.max(1, Number(process.env.MAX_VIDEO_MB || 200)) * 1024 * 1024;
const maxImageBytes = Math.max(1, Number(process.env.MAX_IMAGE_MB || 30)) * 1024 * 1024;
const pendingJobs: CaptureJob[] = [];
let activeJobs = 0;

function json(response: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  response.end(data);
}

function authorized(request: IncomingMessage): boolean {
  if (!token) return false;
  return request.headers.authorization === `Bearer ${token}`;
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("请求体过大");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function publicResult(job: CaptureJob, baseUrl: string): Record<string, unknown> {
  if (!job.result) return { status: job.status, jobId: job.id, error: job.error };
  const result: CaptureResult = job.result;
  return {
    ...result,
    jobId: job.id,
    media: result.media.map(({ sourceUrl: _sourceUrl, ...item }: MediaItem) => ({
      ...item,
      url: `${baseUrl}/v1/captures/${job.id}/media/${encodeURIComponent(item.id)}`
    }))
  };
}

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254 ||
      parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function allowedMediaHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, "");
  return value === "xhscdn.com" || value.endsWith(".xhscdn.com") ||
    value === "xiaohongshu.com" || value.endsWith(".xiaohongshu.com") ||
    value === "douyin.com" || value.endsWith(".douyin.com") ||
    value === "douyinpic.com" || value.endsWith(".douyinpic.com") ||
    value === "douyinvod.com" || value.endsWith(".douyinvod.com") ||
    value === "byteimg.com" || value.endsWith(".byteimg.com") ||
    value === "ibytedtos.com" || value.endsWith(".ibytedtos.com");
}

async function safeMediaFetch(input: string): Promise<Response> {
  let current = input;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("媒体协议不受支持");
    if (!allowedMediaHost(parsed.hostname)) throw new Error("媒体域名不在允许列表");
    const addresses = await lookup(parsed.hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("媒体地址解析到了私有网络");
    const upstream = await fetch(current, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    if (upstream.status < 300 || upstream.status >= 400) return upstream;
    const location = upstream.headers.get("location");
    if (!location) throw new Error("媒体重定向缺少目标地址");
    current = new URL(location, current).toString();
  }
  throw new Error("媒体重定向次数过多");
}

async function proxyMedia(response: ServerResponse, job: CaptureJob, mediaId: string, headOnly = false): Promise<void> {
  const item = job.result?.media.find((media) => media.id === mediaId);
  if (!item) { json(response, 404, { error: "媒体不存在" }); return; }
  const upstream = await safeMediaFetch(item.sourceUrl);
  if (!upstream.ok || !upstream.body) { json(response, 502, { error: `媒体返回 HTTP ${upstream.status}` }); return; }
  const contentLength = Number(upstream.headers.get("content-length") || 0);
  const maxBytes = item.type === "video" ? maxVideoBytes : maxImageBytes;
  if (contentLength > maxBytes) { json(response, 413, { error: "媒体超过大小限制" }); return; }
  response.writeHead(200, {
    "Content-Type": upstream.headers.get("content-type") || (item.type === "video" ? "video/mp4" : "image/jpeg"),
    ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    "Content-Disposition": `attachment; filename="${item.filename}"`,
    "Access-Control-Allow-Origin": "*"
  });
  if (headOnly) { response.end(); return; }
  const reader = upstream.body.getReader();
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { response.destroy(new Error("媒体超过大小限制")); return; }
      response.write(Buffer.from(next.value));
    }
    response.end();
  } catch (error) {
    response.destroy(error instanceof Error ? error : undefined);
  }
}

async function drainJobs(): Promise<void> {
  while (activeJobs < maxConcurrentJobs && pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (!job) return;
    activeJobs += 1;
    job.status = "running";
    try { job.result = await captureService.capture(job.url); job.status = "completed"; }
    catch (error) { job.status = "failed"; job.error = error instanceof Error ? error.message : "解析失败"; }
    finally { activeJobs -= 1; }
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" }); response.end(); return; }
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") { json(response, 200, { status: "ok" }); return; }
  if (!authorized(request)) { json(response, 401, { error: "未授权" }); return; }

  try {
    if (request.method === "POST" && url.pathname === "/v1/captures") {
      const payload = await body(request);
      if (typeof payload.url !== "string" || !payload.url.trim()) { json(response, 400, { error: "url 必填" }); return; }
      if (pendingJobs.length + activeJobs >= maxQueuedJobs) { json(response, 429, { error: "解析队列已满，请稍后重试" }); return; }
      const id = `capture_${randomUUID()}`;
      const job: CaptureJob = { id, url: payload.url.trim(), status: "queued", createdAt: Date.now() };
      jobs.set(id, job);
      pendingJobs.push(job);
      void drainJobs();
      json(response, 202, { jobId: id, status: job.status });
      return;
    }
    const match = url.pathname.match(/^\/v1\/captures\/([^/]+)(?:\/media\/([^/]+))?$/);
    if ((request.method === "GET" || request.method === "HEAD") && match) {
      const job = jobs.get(match[1]);
      if (!job) { json(response, 404, { error: "任务不存在" }); return; }
      if (match[2]) { await proxyMedia(response, job, decodeURIComponent(match[2]), request.method === "HEAD"); return; }
      json(response, 200, publicResult(job, `${url.protocol}//${url.host}`));
      return;
    }
    json(response, 404, { error: "接口不存在" });
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : "请求失败" });
  }
});

const cleanup = setInterval(() => {
  const cutoff = Date.now() - maxJobAge;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 5 * 60 * 1000);

server.listen(port, "0.0.0.0", () => console.log(`social capture service listening on :${port}`));
process.on("SIGTERM", async () => { clearInterval(cleanup); await captureService.close(); server.close(() => process.exit(0)); });
process.on("SIGINT", async () => { clearInterval(cleanup); await captureService.close(); server.close(() => process.exit(0)); });
