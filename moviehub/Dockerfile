# StreamHub's web server on Linux, with ffmpeg. For running the server headless (NAS, home server, a PC with Docker).
# The desktop apps (Windows, Mac) don't use this image.
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY web/ ./

# Settings and downloads live in volumes, so the app's files stay read-only.
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CONFIG_FILE=/config/config.json \
    DOWNLOAD_DIR=/downloads

RUN mkdir -p /config /downloads && chown -R node:node /config /downloads
USER node

EXPOSE 8080
VOLUME ["/config", "/downloads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/config').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server.js"]
