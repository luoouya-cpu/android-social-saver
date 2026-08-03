FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
RUN install -d -o pwuser -g pwuser /app /home/pwuser
COPY --chown=pwuser:pwuser package*.json tsconfig.json ./
USER pwuser
RUN npm ci
COPY --chown=pwuser:pwuser src ./src

ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/home/pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start"]
