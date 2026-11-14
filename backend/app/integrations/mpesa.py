from __future__ import annotations

import base64
import json
import logging
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("findora.integrations.mpesa")


class MpesaResult:
    def __init__(self, *, success: bool, status: str, reference: str | None = None, message: str = "", raw: dict[str, Any] | None = None):
        self.success = success
        self.status = status
        self.reference = reference
        self.message = message
        self.raw = raw or {}


def _base_url() -> str:
    return "https://sandbox.safaricom.co.ke" if settings.mpesa_env == "sandbox" else "https://api.safaricom.co.ke"


def _access_token() -> str:
    credentials = base64.b64encode(
        f"{settings.mpesa_consumer_key}:{settings.mpesa_consumer_secret}".encode()
    ).decode()
    response = httpx.get(
        f"{_base_url()}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {credentials}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def initiate_stk_push(*, phone: str, amount: float, reference: str, description: str) -> MpesaResult:
    """Initiate an M-Pesa STK push.

    Mock mode is explicit and intended for development/demo only; production requires Daraja
    credentials and a publicly reachable HTTPS callback.
    """
    if settings.mpesa_mock:
        mock_ref = f"MOCK{datetime.now().strftime('%Y%m%d%H%M%S')}{abs(hash(reference)) % 10000:04d}"
        logger.info("[MOCK MPESA] amount=%s phone=%s ref=%s", amount, phone, reference)
        return MpesaResult(
            success=True,
            status="success",
            reference=mock_ref,
            message="Mock M-Pesa payment completed. Disable MPESA_MOCK in production.",
            raw={"mock": True, "reference": mock_ref},
        )
    if not settings.mpesa_consumer_key or not settings.mpesa_passkey:
        raise RuntimeError("M-Pesa credentials are not configured")
    timestamp = _timestamp()
    password = base64.b64encode(
        f"{settings.mpesa_shortcode}{settings.mpesa_passkey}{timestamp}".encode()
    ).decode()
    token = _access_token()
    payload = {
        "BusinessShortCode": settings.mpesa_shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(round(amount)),
        "PartyA": phone.replace("+", ""),
        "PartyB": settings.mpesa_shortcode,
        "PhoneNumber": phone.replace("+", ""),
        "CallBackURL": settings.mpesa_callback_url,
        "AccountReference": reference[:12],
        "TransactionDesc": description[:80],
    }
    response = httpx.post(
        f"{_base_url()}/mpesa/stkpush/v1/processrequest",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=25,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("ResponseCode") == "0":
        return MpesaResult(
            success=True,
            status="pending",
            reference=data.get("CheckoutRequestID"),
            message=data.get("CustomerMessage", "Check your phone to complete payment."),
            raw=data,
        )
    return MpesaResult(success=False, status="failed", message=data.get("ResponseDescription", "Payment could not be initiated."), raw=data)


def parse_callback(payload: dict[str, Any]) -> dict[str, Any]:
    callback = payload.get("Body", {}).get("stkCallback", {})
    result_code = callback.get("ResultCode")
    metadata = {
        item.get("Name"): item.get("Value")
        for item in callback.get("CallbackMetadata", {}).get("Item", [])
        if isinstance(item, dict)
    }
    return {
        "checkout_request_id": callback.get("CheckoutRequestID"),
        "merchant_request_id": callback.get("MerchantRequestID"),
        "result_code": result_code,
        "result_desc": callback.get("ResultDesc"),
        "receipt": metadata.get("MpesaReceiptNumber"),
        "amount": metadata.get("Amount"),
        "phone": metadata.get("PhoneNumber"),
        "transaction_date": metadata.get("TransactionDate"),
        "success": result_code == 0,
    }
