FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG SITE_URL=http://localhost:8080
ENV REACT_APP_BACKEND_URL="" REACT_APP_SITE_URL=$SITE_URL GENERATE_SOURCEMAP=false
RUN npm run build

FROM nginx:stable-alpine
COPY deploy/nginx-container.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
