FROM node:22-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git golang-go \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run setup:axl || true

EXPOSE 3000 8787 8788 9002 9012 9022 9032 9042

CMD ["npm", "run", "dev:full"]
