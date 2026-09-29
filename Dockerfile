# Cloud Run 배포용 이미지 — 정적 사이트(Vite 빌드 결과)를 nginx 로 제공한다.
#   gcloud run deploy istea --source . --region asia-northeast3 --allow-unauthenticated

# 1) 빌드: dist/ 생성 (glibc 기반 이미지 — package-lock 의 linux-x64-gnu 바이너리 사용)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) 서빙: nginx 가 8080 포트(Cloud Run 기본)에서 dist/ 를 제공
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
