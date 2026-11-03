"""Runs one chat turn against the model and applies the safety guards."""

import logging

from anthropic import AsyncAnthropic

from app.agent.prompt import build_system_blocks
from app.agent.prompt_guard import guard_output, sanitize_message
from app.core.config import get_settings

logger = logging.getLogger(__name__)

MAX_TOKENS = 4096  # Extra headroom: reasoning blocks also consume this budget, not only the visible text.


async def answer(client: AsyncAnthropic, messages: list[dict], user_name: str) -> str:
    clean_messages = [
        {"role": message["role"], "content": sanitize_message(message["content"])}
        for message in messages
    ]
    response = await client.messages.create(
        model=get_settings().anthropic_model,
        max_tokens=MAX_TOKENS,
        system=build_system_blocks(user_name),
        messages=clean_messages,
    )
    if response.stop_reason == "max_tokens":
        logger.warning("Reply truncated at max_tokens; raise MAX_TOKENS or shorten the instructions")
    text = "".join(block.text for block in response.content if block.type == "text")
    return guard_output(text)
