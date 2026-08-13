# MediaProcess Backend

TypeScript/Node.js/Express backend for media URL analysis and downloads.

## Stack

- Node.js + Express
- TypeScript with `NodeNext` / ESM
- `btch-downloader` providers
- S3-compatible object storage
- Zod validation
- Pino logging
- Vercel serverless entrypoint

## Run locally

1. Copy `.env.example` to `.env`.
2. Fill in the S3-compatible storage credentials.
3. Install dependencies:

```bash
npm install
```

4. Build:

```bash
npm run build
```

5. Start:

```bash
npm start
```

Development:

```bash
npm run dev
```

## API

- `GET /health`
- `GET /api/testing`
- `POST /api/info` with `{ "url": "..." }`
- `POST /api/download` with `{ "url": "...", "quality": "..." }`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/download`

## Vercel

The serverless entrypoint is `api/index.ts`.

Configure the same storage environment variables in the Vercel project settings. Do not commit `.env` or storage secrets.

### Important runtime note

The download job currently performs provider resolution, downloading, and object-storage upload inside the request. This keeps the implementation reliable in a serverless environment because it does not depend on a background process surviving after the function returns. Long downloads can still exceed the serverless function's execution limit; for long-running production downloads, use a dedicated worker/queue service.
