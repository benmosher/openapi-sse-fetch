# Echo Chat Example

A minimal chat app demonstrating **sse-codegen** alongside **Orval**:

- **Backend**: FastAPI with POST (send) and GET SSE (stream) endpoints
- **Frontend**: React + Vite using Orval-generated TanStack Query mutation for POST and sse-codegen-generated `AsyncGenerator` for SSE consumption

## Quick start

### 1. Backend

```bash
cd backend
uv venv && uv pip install -r requirements.txt
uv run uvicorn main:app --port 8000
```

### 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
bash generate.sh   # dumps OpenAPI, runs Orval + sse-codegen
npm run dev
```

Open http://localhost:5173, type a message, and see it echoed back via SSE.

## How it works

- **POST `/messages`** sends a message; the backend broadcasts it to all SSE subscribers
- **GET `/messages/stream`** is an SSE endpoint — each connected client gets its own `asyncio.Queue`
- The FastAPI app patches its OpenAPI schema to use OpenAPI 3.2 `itemSchema` with `text/event-stream`
- **Orval** generates a `usePostMessages` React Query mutation hook from the spec
- **sse-codegen** generates a typed `getMessagesStream` async generator from the SSE endpoint
- The React app combines both: the mutation sends messages, the generator streams them

## Code generation

`generate.sh` runs three steps:

1. `uv run ../backend/dump_openapi.py > openapi.json` — extracts the OpenAPI spec without running the server
2. `npx orval` — generates React Query hooks in `src/generated/orval/`
3. `npx sse-codegen --input openapi.json --output src/generated/sse --base-url ""` — generates SSE client in `src/generated/sse/`

The `--base-url ""` flag makes URLs relative (e.g., `/messages/stream`), which works with Vite's dev proxy.
