from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "bad_request"
    message = "The request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = details
        super().__init__(self.message)


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    message = "Sign in to continue."


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    message = "You do not have permission to do that."


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message = "The requested resource was not found."


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    message = "This action conflicts with existing data."


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"
    message = "Please check the information you submitted."


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Too many attempts. Please wait and try again."


class UnprocessableState(AppError):
    status_code = 422
    code = "invalid_state"
    message = "This action is not allowed in the current state."
