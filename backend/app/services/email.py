"""Transactional email sending through Resend."""

import logging
from typing import Protocol

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailSender(Protocol):
    def send(self, to: str, subject: str, html: str) -> None: ...


class ResendEmailSender:
    def send(self, to: str, subject: str, html: str) -> None:
        settings = get_settings()
        resend.api_key = settings.resend_api_key
        try:
            resend.Emails.send(
                {"from": settings.email_from, "to": [to], "subject": subject, "html": html}
            )
        except Exception:
            # Log without the recipient's content; the caller decides the HTTP response.
            logger.exception("Failed to send email with subject %r", subject)
            raise
