import assert from "node:assert/strict";
import test from "node:test";
import { isPublicHttpUrl, normalizedUrl } from "./service.js";
import { adapterForUrl } from "./platforms.js";

test("normalizes supported long and short links", () => {
  assert.equal(normalizedUrl("讲真的 http://xhslink.cn/o/abc 前往小红书"), "http://xhslink.cn/o/abc");
  assert.equal(normalizedUrl("https://v.douyin.com/abc/"), "https://v.douyin.com/abc/");
});

test("rejects unsupported and private URLs", () => {
  assert.equal(normalizedUrl("https://example.com/a"), undefined);
  assert.equal(isPublicHttpUrl("http://192.168.1.1/a"), false);
  assert.equal(isPublicHttpUrl("http://127.0.0.1/a"), false);
});

test("selects platform adapters", () => {
  assert.equal(adapterForUrl("https://www.xiaohongshu.com/explore/abc")?.platform, "小红书");
  assert.equal(adapterForUrl("https://v.douyin.com/abc")?.platform, "抖音");
});

test("extracts platform fields from embedded page data", () => {
  const adapter = adapterForUrl("https://www.xiaohongshu.com/explore/abc");
  assert.ok(adapter);
  const result = adapter.extract({
    title: "fallback",
    description: "fallback description",
    author: "fallback author",
    publishedAt: "",
    bodyText: "fallback body",
    images: [],
    videos: [],
    scripts: ['{"title":"旅行攻略","nickname":"小明","desc":"上海周末路线 #旅行 #美食"}'],
    jsonLd: []
  }, "https://www.xiaohongshu.com/explore/abc");
  assert.equal(result.title, "旅行攻略");
  assert.equal(result.author, "小明");
  assert.equal(result.content, "上海周末路线 #旅行 #美食");
  assert.deepEqual(result.tags, ["旅行", "美食"]);
});
