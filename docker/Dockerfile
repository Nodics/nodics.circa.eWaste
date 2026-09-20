FROM node:24.20.0-bookworm-slim AS build
ARG STOREFRONT_ORIGIN=http://localhost:6300
ARG STOREFRONT_SITE=agoraApparelSite
ARG STOREFRONT_STORE=agoraMainStore
ARG STOREFRONT_DOMAIN=apparel
ARG STOREFRONT_CURRENCY=USD
ENV VITE_CUSTOMER_CSRF_COOKIE_NAME=nodics_docker_customer_csrf \
    VITE_STOREFRONT_CMS_BASE_URL=http://localhost:5314 \
    VITE_STOREFRONT_MEDIA_BASE_URL=http://localhost:5314 \
    VITE_STOREFRONT_PROFILE_BASE_URL=http://localhost:5300 \
    VITE_STOREFRONT_ENGAGEMENT_BASE_URL=http://localhost:5340 \
    VITE_STOREFRONT_COMMERCE_BASE_URL=${STOREFRONT_ORIGIN} \
    VITE_STOREFRONT_SITE_CODE=${STOREFRONT_SITE} \
    VITE_STOREFRONT_STORE_CODE=${STOREFRONT_STORE} \
    VITE_STOREFRONT_DOMAIN_CODE=${STOREFRONT_DOMAIN} \
    VITE_STOREFRONT_CURRENCY=${STOREFRONT_CURRENCY}
WORKDIR /workspace/frontend
COPY . ./
RUN npm ci --ignore-scripts
RUN npm run build

FROM nginx:1.29.8-alpine3.23
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run
USER nginx
