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
_counter = 0

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/messages", operation_id="postMessages")
async def post_messages(body: MessageBody) -> ChatEvent:
    global _counter
    _counter += 1
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
async def get_messages_stream() -> AsyncIterable[ServerSentEvent[ChatEvent]]:
    q: asyncio.Queue[ChatEvent] = asyncio.Queue()
    subscribers.add(q)
    try:
        while True:
            event = await q.get()
            yield ServerSentEvent[ChatEvent](
                event="message",
                data=event,
                id=str(_counter),
            )
    finally:
        subscribers.discard(q)
