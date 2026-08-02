FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
RUN chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 3000
CMD ["npm", "start"]
