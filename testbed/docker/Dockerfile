FROM node:24-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN ./node_modules/.bin/esbuild testbed/docker/container/main.ts testbed/docker/container/bridge.ts --bundle --platform=node --target=node24 --format=esm --out-extension:.js=.mjs --outdir=/build/bundles --metafile=/build/bundles/meta.json --define:TV_CONTAINER_TOPOLOGY="$(node -p 'JSON.stringify(require("./testbed/docker/topology.json"))')" --define:TV_BENIGN_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/benign-login/index.html","utf8"))')" --define:TV_HIDDEN_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/dom-hidden-injection/index.html","utf8"))')" --define:TV_SECRET_ECHO_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/secret-echo/index.html","utf8"))')" --define:TV_FAKE_REAUTH_PAGE="$(node -p 'JSON.stringify(require("node:fs").readFileSync("testbed/fixtures/fake-reauth/index.html","utf8"))')"
FROM node:24-slim
WORKDIR /app
COPY --from=builder /build/bundles/ /app/
LABEL com.tinyvault.marker=history-surface
USER node
ENTRYPOINT ["node","/app/main.mjs"]
RUN printf '%s' 'tinyvault-export-surface-v1' > /tmp/tinyvault-export.marker
