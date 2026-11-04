"""Transactional email sending through Gmail SMTP."""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_SMTP_HOST = "smtp.gmail.com"
_SMTP_PORT = 587


class EmailSender(Protocol):
    def send(self, to: str, subject: str, html: str) -> None: ...


class GmailSmtpEmailSender:
    """Sends through the sender's own Gmail account (SMTP + an app password).

    Gmail requires the `From` address to match the authenticated account, so
    there is no separate "from" setting — only a display name in front of it.
    """

    def send(self, to: str, subject: str, html: str) -> None:
        settings = get_settings()
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((settings.email_from_name, settings.gmail_address))
        message["To"] = to
        message.set_content("This email requires an HTML-capable client.")
        message.add_alternative(html, subtype="html")
        try:
            with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=10) as smtp:
                smtp.starttls()
                smtp.login(settings.gmail_address, settings.gmail_app_password)
                smtp.send_message(message)
        except Exception:
            # Log without the recipient's content; the caller decides the HTTP response.
            logger.exception("Failed to send email with subject %r", subject)
            raise
