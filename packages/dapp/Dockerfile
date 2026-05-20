FROM node:20.18-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/dapp/package.json packages/dapp/
COPY packages/snap/package.json packages/snap/
RUN npm ci

# Copy dapp source (snap source not needed for dapp build)
COPY packages/dapp packages/dapp

# Write placeholder env values — replaced at container startup via entrypoint.sh
RUN printf 'VITE_MIDDLEWARE_URL=__VITE_MIDDLEWARE_URL__\nVITE_NETWORK=__VITE_NETWORK__\n' > .env

RUN npm run build:dapp

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=builder /app/packages/dapp/dist /usr/share/nginx/html
COPY packages/dapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 packages/dapp/docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
