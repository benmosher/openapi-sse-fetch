from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

app = FastAPI(title="Echo Chat")
app.openapi_version = "3.2.0"

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

class ConnectionStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"

class StatusEvent(BaseModel):
    status: ConnectionStatus
    ts: str

# Discriminated union: two SSE event variants with typed data and literal event names
StreamEvent = (
    ServerSentEvent[ChatEvent, Literal["message"]]
    | ServerSentEvent[StatusEvent, Literal["status"]]
)

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
async def get_messages_stream() -> AsyncIterable[StreamEvent]:
    q: asyncio.Queue[ChatEvent] = asyncio.Queue()
    subscribers.add(q)
    try:
        while True:
            try:
                chat_event = await asyncio.wait_for(q.get(), timeout=10.0)
                yield ServerSentEvent[ChatEvent, Literal["message"]](
                    event="message",
                    data=chat_event,
                    id=str(_counter),
                )
            except asyncio.TimeoutError:
                yield ServerSentEvent[StatusEvent, Literal["status"]](
                    event="status",
                    data=StatusEvent(
                        status=ConnectionStatus.ONLINE,
                        ts=datetime.now(timezone.utc).isoformat(),
                    ),
                )
    finally:
        subscribers.discard(q)
