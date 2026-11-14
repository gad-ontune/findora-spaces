from __future__ import annotations

import re
from datetime import date
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.core.security import normalize_phone


class StrictModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


def _validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must include a letter and a number")
    return value


class RegisterIn(StrictModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=9, max_length=20)
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=128)
    account_type: Literal["property_seeker", "landlord", "property_manager"] = "property_seeker"
    consent: bool
    marketing_consent: bool = False

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("password")
    @classmethod
    def password_valid(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("consent")
    @classmethod
    def consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must accept the privacy notice and terms")
        return value


class LoginIn(StrictModel):
    phone: str = Field(min_length=9, max_length=20)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)


class VerifyPhoneIn(StrictModel):
    phone: str = Field(min_length=9, max_length=20)
    code: str = Field(min_length=4, max_length=8)

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)


class ResendOtpIn(StrictModel):
    phone: str = Field(min_length=9, max_length=20)

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)


class ProfileUpdateIn(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    email: EmailStr | None = None
    bio: str | None = Field(default=None, max_length=1000)
    whatsapp: str | None = Field(default=None, max_length=20)
    preferred_contact: Literal["phone", "sms", "whatsapp", "email"] | None = None
    locale: Literal["en", "sw"] | None = None
    town_id: str | None = None
    marketing_consent: bool | None = None


class AvailabilityIn(StrictModel):
    status: Literal["available", "occupied", "unconfirmed", "temporarily_unavailable"]
    notes: str | None = Field(default=None, max_length=1000)


class PropertyLocationIn(StrictModel):
    town_id: str
    neighbourhood_id: str | None = None
    locality_id: str | None = None
    landmark_id: str | None = None
    address_line: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    public_latitude: float | None = Field(default=None, ge=-90, le=90)
    public_longitude: float | None = Field(default=None, ge=-180, le=180)
    precision: Literal["exact", "approximate", "neighbourhood"] = "approximate"
    directions: str | None = Field(default=None, max_length=1000)


class RentalTermsIn(StrictModel):
    currency: str = Field(default="KES", min_length=3, max_length=3)
    rent_amount: float = Field(gt=0, le=10_000_000)
    deposit_amount: float = Field(default=0, ge=0, le=100_000_000)
    rent_period: Literal["monthly", "quarterly", "biannual", "annual"] = "monthly"
    agency_fee: float | None = Field(default=None, ge=0)
    service_fee: float | None = Field(default=None, ge=0)
    utility_connection_fee: float | None = Field(default=None, ge=0)
    other_mandatory_fee: float | None = Field(default=None, ge=0)
    other_charges: list[dict[str, Any]] = Field(default_factory=list)
    utilities_included: bool = False
    negotiable: bool = False
    available_from: date | None = None
    minimum_lease_months: int | None = Field(default=None, ge=0, le=120)
    payment_schedule: str | None = Field(default=None, max_length=80)


class ResidentialDetailsIn(StrictModel):
    bedrooms: int | None = Field(default=None, ge=0, le=30)
    bathrooms: int | None = Field(default=None, ge=0, le=30)
    house_style: str | None = Field(default=None, max_length=80)
    furnishing: Literal["unfurnished", "semi_furnished", "furnished"] = "unfurnished"
    floor_number: int | None = Field(default=None, ge=-5, le=100)
    has_private_bathroom: bool = False
    parking_spaces: int = Field(default=0, ge=0, le=100)
    outdoor_space: str | None = Field(default=None, max_length=120)
    security_features: list[str] = Field(default_factory=list)
    water_source: str | None = Field(default=None, max_length=120)
    electricity_supply: str | None = Field(default=None, max_length=120)
    shared_accommodation: bool = False


class CommercialDetailsIn(StrictModel):
    floor_area_sqm: float | None = Field(default=None, gt=0, le=1_000_000)
    frontage_m: float | None = Field(default=None, ge=0, le=10_000)
    floor_level: str | None = Field(default=None, max_length=40)
    power_capacity_kva: float | None = Field(default=None, ge=0)
    parking_spaces: int = Field(default=0, ge=0, le=500)
    accessibility: str | None = Field(default=None, max_length=160)
    loading_access: bool = False
    visibility: str | None = Field(default=None, max_length=120)
    road_access: str | None = Field(default=None, max_length=160)
    lease_duration_months: int | None = Field(default=None, ge=0, le=600)
    zoning_note: str | None = Field(default=None, max_length=1000)
    permitted_use_verified: bool = False


class PropertyCreateIn(StrictModel):
    title: str = Field(min_length=8, max_length=200)
    description: str = Field(min_length=40, max_length=8000)
    category: Literal["residential", "commercial"]
    property_type: str = Field(min_length=2, max_length=60)
    location: PropertyLocationIn
    terms: RentalTermsIn
    residential: ResidentialDetailsIn | None = None
    commercial: CommercialDetailsIn | None = None
    amenity_ids: list[str] = Field(default_factory=list)
    commercial_use_ids: list[str] = Field(default_factory=list)
    confirm_authority: bool = False
    confirm_photo_consent: bool = False
    confirm_available_now: bool = True
    recorded_owner_name: str | None = Field(default=None, max_length=160)
    recorded_owner_phone: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def category_details(self) -> PropertyCreateIn:
        if self.category == "residential" and self.residential is None:
            raise ValueError("Residential details are required for residential properties")
        if self.category == "commercial" and self.commercial is None:
            raise ValueError("Commercial details are required for commercial properties")
        if not self.confirm_authority:
            raise ValueError("You must confirm authority to list this property")
        return self


class PropertyUpdateIn(StrictModel):
    title: str | None = Field(default=None, min_length=8, max_length=200)
    description: str | None = Field(default=None, min_length=40, max_length=8000)
    property_type: str | None = Field(default=None, min_length=2, max_length=60)
    location: PropertyLocationIn | None = None
    terms: RentalTermsIn | None = None
    residential: ResidentialDetailsIn | None = None
    commercial: CommercialDetailsIn | None = None
    amenity_ids: list[str] | None = None
    commercial_use_ids: list[str] | None = None


class ReportIn(StrictModel):
    reason: Literal[
        "suspected_fraud",
        "incorrect_information",
        "unavailable",
        "duplicate",
        "misleading_photos",
        "payment_request",
        "other",
    ]
    details: str = Field(min_length=10, max_length=3000)
    phone: str | None = Field(default=None, max_length=20)


class EnquiryCreateIn(StrictModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=9, max_length=20)
    email: EmailStr | None = None
    message: str = Field(min_length=10, max_length=3000)
    enquiry_type: Literal["enquiry", "viewing", "availability"] = "enquiry"

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)


class EnquiryRespondIn(StrictModel):
    response: str = Field(min_length=2, max_length=3000)
    status: Literal["responded", "closed"] = "responded"


class SearchRequestIn(StrictModel):
    category: Literal["residential", "commercial"]
    county_id: str | None = None
    town_id: str | None = None
    neighbourhood_id: str | None = None
    landmark_id: str | None = None
    budget_min: float | None = Field(default=None, ge=0)
    budget_max: float = Field(gt=0)
    property_type: str | None = Field(default=None, max_length=60)
    bedrooms_min: int | None = Field(default=None, ge=0, le=30)
    floor_area_min: float | None = Field(default=None, gt=0)
    floor_area_max: float | None = Field(default=None, gt=0)
    frontage_min: float | None = Field(default=None, ge=0)
    loading_required: bool = False
    parking_required: int | None = Field(default=None, ge=0, le=100)
    facilities: list[str] = Field(default_factory=list)
    move_in_date: date | None = None
    business_type: str | None = Field(default=None, max_length=120)
    requirements: str | None = Field(default=None, max_length=3000)
    contact_method: Literal["phone", "sms", "whatsapp", "email"] = "phone"
    assistance_requirements: str | None = Field(default=None, max_length=2000)
    guest_name: str | None = Field(default=None, max_length=160)
    guest_phone: str | None = Field(default=None, max_length=20)
    guest_email: EmailStr | None = None
    consent_to_share: bool = False

    @field_validator("guest_phone")
    @classmethod
    def phone_valid(cls, value: str | None) -> str | None:
        return normalize_phone(value) if value else value

    @model_validator(mode="after")
    def budget_range(self) -> SearchRequestIn:
        if self.budget_min is not None and self.budget_min > self.budget_max:
            raise ValueError("Minimum budget cannot exceed maximum budget")
        return self


class CancelRequestIn(StrictModel):
    reason: str = Field(min_length=3, max_length=1000)


class MessageIn(StrictModel):
    body: str = Field(min_length=1, max_length=3000)
    is_internal: bool = False


class RequestStatusIn(StrictModel):
    status: Literal[
        "received",
        "under_review",
        "matching",
        "awaiting_local_investigation",
        "matches_available",
        "awaiting_seeker_response",
        "completed",
        "unable_to_find_suitable_match",
    ]
    notes: str | None = Field(default=None, max_length=2000)


class AssignmentCreateIn(StrictModel):
    partner_id: str
    instructions: str | None = Field(default=None, max_length=3000)
    due_at: date | None = None


class FieldReportIn(StrictModel):
    report_type: Literal["investigation", "availability_check", "viewing", "inspection"] = "investigation"
    summary: str = Field(min_length=10, max_length=5000)
    findings: dict[str, Any] = Field(default_factory=dict)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_phone: str | None = Field(default=None, max_length=20)
    property_found: bool = False
    photos: list[str] = Field(default_factory=list)


class AssignmentDecisionIn(StrictModel):
    reason: str | None = Field(default=None, max_length=1000)


class ExternalMatchIn(StrictModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=3000)
    rent_amount: float | None = Field(default=None, gt=0)
    location_text: str | None = Field(default=None, max_length=255)


class ViewingCreateIn(StrictModel):
    property_id: str
    seeker_name: str = Field(min_length=2, max_length=160)
    seeker_phone: str = Field(min_length=9, max_length=20)
    preferred_date: date | None = None
    preferred_time: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("seeker_phone")
    @classmethod
    def phone_valid(cls, value: str) -> str:
        return normalize_phone(value)


class ViewingUpdateIn(StrictModel):
    status: Literal["proposed", "confirmed", "completed", "cancelled", "missed"]
    scheduled_at: str | None = None
    meeting_point: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    cancellation_reason: str | None = Field(default=None, max_length=1000)


class ViewingFeedbackIn(StrictModel):
    matched_photos: bool | None = None
    matched_description: bool | None = None
    rent_matched: bool | None = None
    property_available: bool | None = None
    representative_reachable: bool | None = None
    suspected_fraud: bool = False
    rating: int | None = Field(default=None, ge=1, le=5)
    comments: str | None = Field(default=None, max_length=3000)


class FavouriteIn(StrictModel):
    property_id: str


class ComparisonIn(StrictModel):
    property_ids: list[str] = Field(min_length=2, max_length=4)
    name: str | None = Field(default=None, max_length=160)


class ShortlistIn(StrictModel):
    name: str = Field(min_length=2, max_length=160)
    property_ids: list[str] = Field(default_factory=list, max_length=12)
    description: str | None = Field(default=None, max_length=1000)


class ShortlistCommentIn(StrictModel):
    body: str = Field(min_length=1, max_length=2000)
    author_name: str | None = Field(default=None, max_length=120)


class NotificationPreferencesIn(StrictModel):
    in_app: bool | None = None
    sms: bool | None = None
    email: bool | None = None
    whatsapp: bool | None = None
    marketing: bool | None = None


class PaymentInitiateIn(StrictModel):
    purpose: Literal["assisted_search", "featured_listing", "subscription", "inspection"]
    related_id: str | None = None
    phone: str | None = Field(default=None, max_length=20)
    idempotency_key: str = Field(min_length=8, max_length=100)
    plan_code: str | None = None

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str | None) -> str | None:
        return normalize_phone(value) if value else value


class RefundIn(StrictModel):
    amount: float = Field(gt=0)
    reason: str = Field(min_length=5, max_length=2000)


class ModerationIn(StrictModel):
    action: Literal["approve", "reject", "suspend", "archive", "reactivate"]
    reason: str | None = Field(default=None, max_length=2000)


class VerificationReviewIn(StrictModel):
    status: Literal["verified", "failed", "pending", "expired"]
    notes: str | None = Field(default=None, max_length=2000)
    rejection_reason: str | None = Field(default=None, max_length=2000)
    evidence_reference: str | None = Field(default=None, max_length=255)
    expires_in_days: int | None = Field(default=None, ge=1, le=730)


class VerificationRequestIn(StrictModel):
    verification_type: Literal[
        "identity", "ownership", "authority", "inspection", "rent", "details"
    ]
    notes: str | None = Field(default=None, max_length=2000)


class InspectionIn(StrictModel):
    inspection_date: date | None = None
    exterior_condition: str | None = Field(default=None, max_length=80)
    interior_condition: str | None = Field(default=None, max_length=80)
    water_facilities: str | None = Field(default=None, max_length=160)
    electricity: str | None = Field(default=None, max_length=160)
    doors_windows: str | None = Field(default=None, max_length=160)
    plumbing: str | None = Field(default=None, max_length=160)
    access: str | None = Field(default=None, max_length=160)
    outstanding_concerns: str | None = Field(default=None, max_length=3000)
    findings: dict[str, Any] = Field(default_factory=dict)
    status: Literal["submitted", "reviewed", "passed"] = "submitted"


class PropertyReportResolveIn(StrictModel):
    status: Literal["reviewing", "resolved", "dismissed"]
    resolution: str = Field(min_length=3, max_length=2000)


class UserAdminUpdateIn(StrictModel):
    status: Literal["active", "suspended", "deleted"] | None = None
    role_codes: list[str] | None = None


class SettingsUpdateIn(StrictModel):
    value: Any


class ComplaintIn(StrictModel):
    category: str = Field(min_length=2, max_length=60)
    description: str = Field(min_length=10, max_length=4000)
    property_id: str | None = None
    search_request_id: str | None = None
    name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, value: str | None) -> str | None:
        return normalize_phone(value) if value else value


class ComplaintResolveIn(StrictModel):
    status: Literal["reviewing", "resolved", "dismissed"]
    resolution: str = Field(min_length=3, max_length=2000)


class PartnerApplyIn(StrictModel):
    partner_type: Literal["finding", "data_collection", "both"]
    company_name: str | None = Field(default=None, max_length=160)
    phone_alt: str | None = Field(default=None, max_length=20)
    town_id: str
    neighbourhood_ids: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=2000)


class SupportTicketIn(StrictModel):
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=4000)
    category: str = Field(default="general", max_length=60)


class SavedSearchIn(StrictModel):
    name: str = Field(min_length=2, max_length=160)
    category: Literal["residential", "commercial"]
    filters: dict[str, Any] = Field(default_factory=dict)
    notify: bool = False
