from typing import Literal

from pydantic import BaseModel, Field

MAX_MESSAGES = 40
MAX_MESSAGE_LENGTH = 4000


class ChatMessage(BaseModel):
    # "system" is deliberately not allowed: clients cannot inject system instructions.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)


class ChatResponse(BaseModel):
    reply: str
