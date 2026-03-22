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

The stream endpoint yields a discriminated union of `ServerSentEvent[Data, Literal["event_name"]]`
types. FastAPI automatically emits an OpenAPI 3.1 `itemSchema` with `oneOf` and a `discriminator`
for the `text/event-stream` response — no `openapi_extra` needed.
