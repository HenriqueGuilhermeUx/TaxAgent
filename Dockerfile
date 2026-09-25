FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends libxml2-utils ca-certificates curl unar \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run schemas:sync -- --environment=test
RUN npx tsx scripts/national-conformance.ts
RUN npx tsx scripts/national-event-conformance.ts
ENV TAXAGENT_GISS_XSD_SHA256=c0e2b81b93faea908b70d42e827b44acc34b634153aa006cd35851e77ebad0e6
RUN npx tsx scripts/giss-emission-conformance.ts
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends libxml2-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/schemas ./schemas
COPY --from=build /app/tax-domains ./tax-domains
EXPOSE 3000
CMD ["/bin/sh", "-c", "node dist/database/migrate-cli.js && node dist/main.js"]
