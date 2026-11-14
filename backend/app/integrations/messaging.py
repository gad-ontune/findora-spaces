from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings

logger = logging.getLogger("findora.integrations.messaging")


def send_sms(phone: str, message: str) -> dict:
    if settings.sms_provider == "mock":
        logger.info("[MOCK SMS] to=%s body=%s", phone, message[:140])
        return {"status": "sent", "provider": "mock", "reference": f"mock-sms-{abs(hash((phone, message))) % 10_000_000}"}
    if not settings.sms_api_key:
        raise RuntimeError("SMS provider is not configured")
    # Generic provider adapter. Replace the endpoint/payload for the chosen Kenyan provider.
    response = httpx.post(
        "https://api.africastalking.com/version1/messaging",
        headers={"apiKey": settings.sms_api_key, "Accept": "application/json"},
        data={"username": "findora", "to": phone, "message": message, "from": settings.sms_sender_id},
        timeout=15,
    )
    response.raise_for_status()
    return {"status": "sent", "provider": settings.sms_provider, "payload": response.json()}


def send_email(to: str, subject: str, body: str) -> dict:
    if settings.email_provider == "mock" or not settings.smtp_host:
        logger.info("[MOCK EMAIL] to=%s subject=%s", to, subject)
        return {"status": "sent", "provider": "mock"}
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
    return {"status": "sent", "provider": "smtp"}


def send_whatsapp(phone: str, message: str) -> dict:
    if settings.whatsapp_provider == "mock":
        logger.info("[MOCK WHATSAPP] to=%s body=%s", phone, message[:140])
        return {"status": "sent", "provider": "mock"}
    if not settings.whatsapp_token or not settings.whatsapp_phone_id:
        raise RuntimeError("WhatsApp provider is not configured")
    response = httpx.post(
        f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_id}/messages",
        headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
        json={
            "messaging_product": "whatsapp",
            "to": phone.replace("+", ""),
            "type": "text",
            "text": {"body": message},
        },
        timeout=15,
    )
    response.raise_for_status()
    return {"status": "sent", "provider": "whatsapp_cloud", "payload": response.json()}
