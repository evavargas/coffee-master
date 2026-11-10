"""Request and response models for the chat endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.agent.prompt_guard import MESSAGE_MAX_LENGTH, sanitize_message
from app.schemas.recipe import RecipeData, RecipeRef


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


class StoredProposal(BaseModel):
    proposal_id: int
    recipe: RecipeData
    saved_recipe_id: int | None = Field(description="The user recipe this proposal was saved as, or null.")


class StoredMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    proposal: StoredProposal | None = Field(default=None, description="Recipe proposed by this assistant message.")


class LatestConversationResponse(BaseModel):
    conversation_id: int | None
    messages: list[StoredMessage]
    recipe_ref: RecipeRef | None = None


class ConversationSummary(BaseModel):
    id: int
    recipe_ref: RecipeRef | None
    created_at: datetime
    updated_at: datetime = Field(description="Time of the last message, or creation time when empty.")


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]
    total: int
    limit: int
    offset: int


class ConversationDetail(BaseModel):
    id: int
    recipe_ref: RecipeRef | None
    messages: list[StoredMessage]


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipe_ref: RecipeRef | None = Field(
        default=None, description="Catalog slug (string) or the caller's own recipe id (integer) to talk about."
    )
