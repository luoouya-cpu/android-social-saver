# Social Capture Service

运行在 NAS Docker 上的小红书/抖音公开内容解析服务。

## 本地测试

```bash
npm install
npm test
API_TOKEN=change-me npm start
```

## Docker

```bash
cp .env.example .env
# 修改 .env 中的 API_TOKEN
docker compose up -d --build
curl http://NAS-IP:3000/health
```

Playwright 官方镜像包含 Chromium 和系统依赖；项目固定使用同一版本的 npm 包和镜像，避免浏览器版本不匹配。运行时不保存账号 Cookie，只访问公开页面。
