FROM node:22-slim
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* 값은 빌드 때 번들에 들어간다. Railway는 ARG로 선언한 서비스 변수만 빌드에 넘긴다.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY
RUN pnpm build
CMD ["pnpm", "start"]
