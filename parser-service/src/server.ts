import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { CaptureService } from "./service.js";
import type { CaptureJob, CaptureResult, MediaItem } from "./types.js";

const port = Number(process.env.PORT || 3000);
const token = process.env.API_TOKEN || "";
const jobs = new Map<string, CaptureJob>();
const captureService = new CaptureService();
const maxBodyBytes = 64 * 1024;
const maxJobAge = 30 * 60 * 1000;

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

async function proxyMedia(response: ServerResponse, job: CaptureJob, mediaId: string): Promise<void> {
  const item = job.result?.media.find((media) => media.id === mediaId);
  if (!item) { json(response, 404, { error: "媒体不存在" }); return; }
  const upstream = await fetch(item.sourceUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!upstream.ok || !upstream.body) { json(response, 502, { error: `媒体返回 HTTP ${upstream.status}` }); return; }
  const contentLength = Number(upstream.headers.get("content-length") || 0);
  const maxBytes = item.type === "video" ? 200 * 1024 * 1024 : 30 * 1024 * 1024;
  if (contentLength > maxBytes) { json(response, 413, { error: "媒体超过大小限制" }); return; }
  response.writeHead(200, {
    "Content-Type": upstream.headers.get("content-type") || (item.type === "video" ? "video/mp4" : "image/jpeg"),
    ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    "Content-Disposition": `attachment; filename="${item.filename}"`,
    "Access-Control-Allow-Origin": "*"
  });
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

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" }); response.end(); return; }
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") { json(response, 200, { status: "ok" }); return; }
  if (!authorized(request)) { json(response, 401, { error: "未授权" }); return; }

  try {
    if (request.method === "POST" && url.pathname === "/v1/captures") {
      const payload = await body(request);
      if (typeof payload.url !== "string" || !payload.url.trim()) { json(response, 400, { error: "url 必填" }); return; }
      const id = `capture_${randomUUID()}`;
      const job: CaptureJob = { id, url: payload.url.trim(), status: "queued", createdAt: Date.now() };
      jobs.set(id, job);
      void (async () => {
        job.status = "running";
        try { job.result = await captureService.capture(job.url); job.status = "completed"; }
        catch (error) { job.status = "failed"; job.error = error instanceof Error ? error.message : "解析失败"; }
      })();
      json(response, 202, { jobId: id, status: job.status });
      return;
    }
    const match = url.pathname.match(/^\/v1\/captures\/([^/]+)(?:\/media\/([^/]+))?$/);
    if (request.method === "GET" && match) {
      const job = jobs.get(match[1]);
      if (!job) { json(response, 404, { error: "任务不存在" }); return; }
      if (match[2]) { await proxyMedia(response, job, decodeURIComponent(match[2])); return; }
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
