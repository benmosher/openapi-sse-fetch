# Echo Chat Backend

FastAPI backend for the echo-chat example. Follow the official FastAPI best practices skill at:

> https://github.com/fastapi/fastapi/blob/master/fastapi/.agents/skills/fastapi/SKILL.md

## Key conventions used here

- **`fastapi dev` / `fastapi run`** for development and production respectively (not bare `uvicorn`)
- **Return type annotations** on all path operation functions — used by FastAPI for validation and schema generation
- **No `...` (Ellipsis)** as default values in Pydantic models or path operation parameters
- **`Annotated`** style for any path, query, or header parameters (none currently, but use it when added)
- **One operation per function** — GET and POST endpoints are separate functions

## Running

```bash
fastapi dev main.py          # development (auto-reload, debug)
fastapi run main.py          # production
```

## SSE pattern

The stream endpoint yields `ServerSentEvent` objects with `event`, `data`, and `id` fields.
FastAPI does not automatically include the `itemSchema` in OpenAPI when the yield type is
`ServerSentEvent`, so the schema is supplied via `openapi_extra` on the decorator.
