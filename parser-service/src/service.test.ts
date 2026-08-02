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
