# MediaProcess — Local Backend

This backend is configured for **local file handling only**.

There is **no S3, AWS, Cloudflare R2, Redis, or cloud file storage** in this version.

The flow is:

`Frontend -> Node/Express -> media provider -> local temporary file -> browser`

The media source itself is necessarily fetched over the internet. No downloaded file is uploaded to a storage service.

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
```

Copy `.env.example` to `.env` and adjust the values if needed.

```bash
npm run dev
```

The API starts at `http://localhost:4000`.

## Endpoints

### Health

`GET /health`

### Media information

`POST /api/info`

```json
{ "url": "https://..." }
```

### Job-based download

`POST /api/download`

```json
{
  "url": "https://...",
  "quality": "mp4"
}
```

Returns a `jobId`. Poll:

`GET /api/jobs/:jobId`

When the job is completed:

`GET /api/jobs/:jobId/download`

returns a local URL. The browser then receives the file from:

`GET /api/jobs/:jobId/file`

### Direct download

`POST /api/download/direct`

This endpoint downloads the media to a temporary local file and streams it directly to the browser. It does not create a job record.

## Temporary files

Downloaded files are stored under the operating system temporary directory and removed after delivery. Job files are also automatically cleaned after `JOB_TTL_HOURS`.

## Environment

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000
PUBLIC_BASE_URL=http://localhost:4000
MAX_FILE_SIZE_MB=500
JOB_TTL_HOURS=24
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
LOG_LEVEL=info
```

No storage credentials are required.

## Important deployment note

This version is intentionally a **persistent local Node.js server**. Do not deploy the local-file workflow as a Vercel serverless function. Use it on your development PC or a persistent Node.js/VPS server.

Only download content you own or are authorized to download and follow the applicable platform terms.
