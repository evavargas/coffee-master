"""Request and response models for the chat endpoints."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.agent.prompt_guard import MESSAGE_MAX_LENGTH, sanitize_message


class ChatRequest(BaseModel):
    conversation_id: int | None = Field(
        default=None, description="Existing conversation to continue, or null to start a new one."
    )
    message: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        cleaned = sanitize_message(value)
        if not cleaned:
            raise ValueError("The message is empty after removing unsafe characters.")
        return cleaned


class StoredMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class LatestConversationResponse(BaseModel):
    conversation_id: int | None
    messages: list[StoredMessage]
