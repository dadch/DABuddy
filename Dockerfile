# ThesisBuddy — Produktions-Image
# Node 22 LTS auf Debian Bookworm (glibc: bcrypt/pg-Prebuilds funktionieren ohne Build-Tools).
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Nur Manifeste kopieren → Docker-Layer-Cache für npm ci bleibt bei Codeänderungen erhalten.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Applikationscode (siehe .dockerignore: ohne .env, node_modules, uploads, data)
COPY . .

# Persistente Verzeichnisse (werden als Volumes gemountet) + Besitzrechte für
# den unprivilegierten node-User anlegen.
RUN mkdir -p uploads data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "app.js"]
