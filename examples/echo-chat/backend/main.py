from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

app = FastAPI(title="Echo Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class MessageBody(BaseModel):
    message: str

class ChatEvent(BaseModel):
    message: str
    ts: str

# ---------------------------------------------------------------------------
# Broadcast machinery
# ---------------------------------------------------------------------------

subscribers: set[asyncio.Queue[ChatEvent]] = set()

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/messages", operation_id="postMessages")
async def post_messages(body: MessageBody) -> ChatEvent:
    event = ChatEvent(
        message=body.message,
        ts=datetime.now(timezone.utc).isoformat(),
    )
    for q in subscribers:
        await q.put(event)
    return event


@app.get(
    "/messages/stream",
    operation_id="getMessagesStream",
    response_class=EventSourceResponse,
)
async def get_messages_stream() -> AsyncIterable[ServerSentEvent]:
    q: asyncio.Queue[ChatEvent] = asyncio.Queue()
    subscribers.add(q)
    try:
        while True:
            event = await q.get()
            yield ServerSentEvent(event="message", data=event)
    finally:
        subscribers.discard(q)

# ---------------------------------------------------------------------------
# OpenAPI patching  – 3.2 + text/event-stream itemSchema
# ---------------------------------------------------------------------------

_original_openapi = app.openapi

def custom_openapi():
    schema = _original_openapi()
    schema["openapi"] = "3.2.0"

    chat_event_ref = {"$ref": "#/components/schemas/ChatEvent"}

    stream_op = schema["paths"]["/messages/stream"]["get"]
    stream_op["responses"]["200"]["content"] = {
        "text/event-stream": {
            "schema": {
                "type": "object",
                "itemSchema": {
                    "oneOf": [
                        {
                            "type": "object",
                            "properties": {
                                "event": {"type": "string", "const": "message"},
                                "data": {
                                    "type": "string",
                                    "contentMediaType": "application/json",
                                    "contentSchema": chat_event_ref,
                                },
                            },
                        }
                    ]
                },
            }
        }
    }

    return schema

app.openapi = custom_openapi
