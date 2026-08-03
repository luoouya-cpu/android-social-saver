export type Platform = "小红书" | "抖音";
export type MediaType = "image" | "video";

export interface MediaItem {
  id: string;
  type: MediaType;
  sourceUrl: string;
  filename: string;
  size?: number;
  mimeType?: string;
  cachedPath?: string;
}

export interface CaptureResult {
  status: "completed";
  platform: Platform;
  canonicalUrl: string;
  title: string;
  author: string;
  content: string;
  publishedAt: string;
  tags: string[];
  media: MediaItem[];
  warnings: string[];
}

export interface CaptureJob {
  id: string;
  url: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: number;
  result?: CaptureResult;
  error?: string;
}
