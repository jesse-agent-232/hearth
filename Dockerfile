# The build stage runs on the runner's own platform: its output is plain
# JavaScript and no production dependency ships a native binary, so only the
# small final stage needs emulation for arm64. Running npm ci under QEMU hung
# the multi-platform release build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/static ./static
COPY config.example.yml config.demo.yml ./
RUN mkdir -p /app/data

ENV CONFIG_PATH=/app/config.yml
ENV DATABASE_PATH=/app/data/holm.db
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "build"]
