FROM node:20.18-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/dapp/package.json packages/dapp/
COPY packages/snap/package.json packages/snap/
RUN npm ci

# Copy dapp source (snap source not needed for dapp build)
COPY packages/dapp packages/dapp

# Write placeholder env values — replaced at container startup via docker-entrypoint.d
RUN printf 'VITE_MIDDLEWARE_URL=__VITE_MIDDLEWARE_URL__\nVITE_NETWORK=__VITE_NETWORK__\nVITE_SNAP_ID=__VITE_SNAP_ID__\nVITE_ENABLE_NON_CUSTODIAL=__VITE_ENABLE_NON_CUSTODIAL__\n' > .env

RUN npm run build:dapp

FROM nginxinc/nginx-unprivileged:1.27-alpine
# Remove the root-owned html dir so the COPY below creates a nginx-owned one,
# allowing sed -i (which needs to create temp files in the directory) to succeed.
USER root
RUN rm -rf /usr/share/nginx/html
COPY --chown=nginx:nginx --from=builder /app/packages/dapp/dist /usr/share/nginx/html
USER nginx
COPY packages/dapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 packages/dapp/docker-entrypoint.sh /docker-entrypoint.d/40-env-injection.sh

EXPOSE 8080
