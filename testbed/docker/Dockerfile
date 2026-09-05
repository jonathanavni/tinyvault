FROM node:24-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN ./node_modules/.bin/esbuild testbed/docker/container/main.ts testbed/docker/container/bridge.ts --bundle --platform=node --format=esm --out-extension:.js=.mjs --outdir=/build/bundles --metafile=/build/bundles/meta.json
FROM node:24-slim
WORKDIR /app
COPY --from=builder /build/bundles/ /app/
LABEL com.tinyvault.marker=history-surface
USER node
CMD ["node","/app/main.mjs"]
RUN printf '%s' 'tinyvault-export-surface-v1' > /tmp/tinyvault-export.marker
