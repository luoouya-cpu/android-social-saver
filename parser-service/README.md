# Social Capture Service

运行在 NAS Docker 上的小红书/抖音公开内容解析服务。

## 本地测试

```bash
npm install
npm test
API_TOKEN=replace-this-with-a-32-character-random-token npm start
```

## Docker

```bash
# 修改 docker-compose.yml：
# 1. 将 API_TOKEN 改成至少 32 位的随机字符串。
# 2. 将端口绑定 IP 改成 NAS 的固定局域网 IP。
docker compose up -d --build
curl http://NAS-IP:3000/health
```

Playwright 官方镜像包含 Chromium 和系统依赖；项目固定使用同一版本的 npm 包和镜像，避免浏览器版本不匹配。运行时不保存账号 Cookie，只访问公开页面。媒体会先下载到容器的临时目录，校验类型和大小后再提供给 Obsidian；任务过期时自动清理。

## 安全要求

- `API_TOKEN` 必须至少 32 位；保留 Compose 中的占位值时服务会拒绝启动。
- Compose 默认仅绑定 NAS 的局域网 IP。请为 NAS 设置 DHCP 静态租约，IP 变化时同步修改端口绑定。
- 不要将 3000 端口映射到公网，也不要通过 UGREENlink 或路由器端口转发公开它。
