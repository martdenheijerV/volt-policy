FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY server.mjs ./
EXPOSE 1234
CMD ["node", "server.mjs"]
