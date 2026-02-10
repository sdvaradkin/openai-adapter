# openai-adapter

Minimal Node.js/TypeScript service scaffold for the OpenAI Adapter.

## Requirements

- Node.js 20+
- npm
- Docker (optional, for container build/run)

## Scripts

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — run dev server with watch
- `npm start` — run compiled server (`node dist/index.js`)
- `npm test` — run tests (Vitest)
- `npm run lint` — lint `src/` and `tests/`
- `npm run format` — format with Prettier

## Running locally

```bash
npm ci
npm run build
PORT=3000 node dist/index.js
```

Health endpoint:

```bash
curl -f http://localhost:3000/health
```

## Environment variables

- `PORT` (default: `3000`) — server listen port
- `LOG_PRETTY` (optional) — set to `1` for pretty logs in development (requires `pino-pretty`)

## Docker

Build:

```bash
docker build -t openai-adapter:test .
```

Run:

```bash
docker run -p 3000:3000 openai-adapter:test
```

Health:

```bash
curl -f http://localhost:3000/health
```
