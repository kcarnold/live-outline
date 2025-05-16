# https://docs.docker.com/guides/nodejs/containerize/
FROM node:24-slim
EXPOSE 5008
ENV NODE_ENV=production
ENV PORT=5008
WORKDIR /usr/src/app

COPY yarn.lock package.json ./
# Need to install dev dependencies to build the app.
RUN yarn install --production=false

# Copy the rest of the source files into the image.
COPY . .
RUN yarn run build

# Run the application as a non-root user.
USER node

CMD ["node", "server.ts"]
