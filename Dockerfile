# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# ติดตั้ง dependencies ก่อน (cache layer)
COPY package*.json ./
RUN npm ci

# copy โค้ดและ .env แล้ว build
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:alpine

# copy ไฟล์ที่ build แล้วไปไว้ใน Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# config Nginx สำหรับ React SPA (รองรับ React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
