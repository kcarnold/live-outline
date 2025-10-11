# https://docs.docker.com/guides/nodejs/containerize/
FROM node:24-slim
EXPOSE 5008
ENV PORT=5008
WORKDIR /usr/src/app

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source files into the image.
COPY . .
RUN npm run build

# Run the application as a non-root user.
USER node

ENV NODE_ENV=production
CMD ["node", "server.ts"]
