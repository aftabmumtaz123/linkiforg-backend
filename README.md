# MediaProcess Backend

TypeScript + Express backend configured for NodeNext/ESM and Vercel.

## Local setup

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

Copy `.env.example` to `.env` and provide the S3-compatible storage values.

## Important deployment note

This project intentionally contains only TypeScript source files under `src/`. Imports use `.js` extensions because the compiler targets NodeNext/ESM; do not change those imports to `.ts`.

Before deploying to Vercel, make sure old generated/source `.js` files are not present in `src/`, and redeploy a fresh commit so Vercel does not retain stale source paths.

## Vercel environment variables

Required:

- `STORAGE_ENDPOINT`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

Optional:

- `STORAGE_REGION`
- `STORAGE_PUBLIC_URL`
- `STORAGE_FORCE_PATH_STYLE`
- `CORS_ORIGIN`
- `PORT`
- `MAX_FILE_SIZE_MB`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `LOG_LEVEL`
