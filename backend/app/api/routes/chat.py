"""Chat endpoint: answers coffee questions for the logged-in user."""

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, status

from app.agent.runner import answer
from app.api.deps import get_anthropic_client, get_current_user
from app.core.rate_limit import chat_rate_limit
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/api", tags=["chat"], dependencies=[chat_rate_limit])


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask the coffee agent",
    description="Sends the conversation and returns the agent's reply, addressed to the logged-in user by first name. Requires a bearer token.",
    responses={
        401: {"description": "Missing, invalid or expired session"},
        422: {"description": "Invalid messages, or the last message is not from the user"},
    },
)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    client: AsyncAnthropic = Depends(get_anthropic_client),
) -> ChatResponse:
    if body.messages[-1].role != "user":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "El último mensaje debe ser del usuario.")
    reply = await answer(client, [m.model_dump() for m in body.messages], user_name=current_user.name)
    return ChatResponse(reply=reply)
