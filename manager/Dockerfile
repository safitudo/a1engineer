FROM node:22-slim
RUN apt-get update && apt-get install -y docker-compose-plugin curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
COPY templates/ ./templates/
CMD ["node", "src/index.js"]
