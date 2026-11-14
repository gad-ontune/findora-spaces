from __future__ import annotations

from dataclasses import dataclass


class P:
    """Permission catalogue. Keep codes stable; they are persisted in the database."""

    PROPERTY_CREATE = "property:create"
    PROPERTY_UPDATE = "property:update"
    PROPERTY_MODERATE = "property:moderate"
    PROPERTY_VERIFY = "verification:review"
    VERIFICATION_SUBMIT = "verification:submit"
    AVAILABILITY_MANAGE = "availability:manage"
    ENQUIRY_MANAGE = "enquiry:manage"
    VIEWING_REQUEST = "viewing:request"
    VIEWING_MANAGE = "viewing:manage"
    FAVOURITE_MANAGE = "favourite:manage"
    ASSISTED_REQUEST = "assisted:request"
    ASSISTED_MANAGE = "assisted:manage"
    PARTNER_ASSIGNMENT = "partner:assignment"
    PARTNER_REPORTS = "partner:reports"
    PARTNER_MANAGE = "partner:manage"
    DATA_COLLECT = "partner:data_collect"
    PAYMENT_INITIATE = "payment:initiate"
    PAYMENT_VIEW = "payment:view"
    PAYMENT_REFUND = "payment:refund"
    USER_MANAGE = "user:manage"
    ROLE_MANAGE = "role:manage"
    ANALYTICS_VIEW = "analytics:view"
    AUDIT_READ = "audit:read"
    SETTINGS_MANAGE = "settings:manage"
    COMPLAINT_MANAGE = "complaint:manage"
    LOCATION_MANAGE = "location:manage"
    PROMOTION_MANAGE = "promotion:manage"
    SUPPORT_VIEW = "support:view"
    SUPPORT_MESSAGE = "support:message"


DEFAULT_PERMISSIONS: dict[str, str] = {
    P.PROPERTY_CREATE: "Create property listings",
    P.PROPERTY_UPDATE: "Update properties the user owns or manages",
    P.PROPERTY_MODERATE: "Approve, reject and suspend listings",
    P.VERIFICATION_SUBMIT: "Submit verification evidence",
    P.PROPERTY_VERIFY: "Review verification submissions",
    P.AVAILABILITY_MANAGE: "Update property availability",
    P.ENQUIRY_MANAGE: "Respond to property enquiries",
    P.VIEWING_REQUEST: "Request property viewings",
    P.VIEWING_MANAGE: "Coordinate property viewings",
    P.FAVOURITE_MANAGE: "Save and compare properties",
    P.ASSISTED_REQUEST: "Submit assisted property search requests",
    P.ASSISTED_MANAGE: "Process assisted search requests",
    P.PARTNER_ASSIGNMENT: "Accept and work on partner assignments",
    P.PARTNER_REPORTS: "Submit partner field reports",
    P.PARTNER_MANAGE: "Manage local partners",
    P.DATA_COLLECT: "Collect property data in assigned areas",
    P.PAYMENT_INITIATE: "Pay for platform services",
    P.PAYMENT_VIEW: "View payment records",
    P.PAYMENT_REFUND: "Process refunds",
    P.USER_MANAGE: "Manage user accounts",
    P.ROLE_MANAGE: "Manage roles and permissions",
    P.ANALYTICS_VIEW: "View operational analytics",
    P.AUDIT_READ: "Read audit logs",
    P.SETTINGS_MANAGE: "Manage platform configuration",
    P.COMPLAINT_MANAGE: "Review complaints and reports",
    P.LOCATION_MANAGE: "Manage locations and landmarks",
    P.PROMOTION_MANAGE: "Manage promotions and plans",
    P.SUPPORT_VIEW: "View assisted search operations",
    P.SUPPORT_MESSAGE: "Communicate with seekers",
}

BASIC_PERMISSIONS = [P.FAVOURITE_MANAGE, P.VIEWING_REQUEST, P.ASSISTED_REQUEST, P.PAYMENT_INITIATE]

ROLE_DEFINITIONS: dict[str, tuple[str, str, list[str]]] = {
    "property_seeker": (
        "Property Seeker",
        "Saves properties, requests viewings and assisted searches",
        BASIC_PERMISSIONS,
    ),
    "landlord": (
        "Landlord",
        "Owns and advertises rental property",
        [
            P.PROPERTY_CREATE,
            P.PROPERTY_UPDATE,
            P.AVAILABILITY_MANAGE,
            P.ENQUIRY_MANAGE,
            P.VIEWING_MANAGE,
            P.VERIFICATION_SUBMIT,
            P.PAYMENT_INITIATE,
        ],
    ),
    "property_manager": (
        "Property Manager",
        "Manages property on behalf of an authorized owner",
        [
            P.PROPERTY_CREATE,
            P.PROPERTY_UPDATE,
            P.AVAILABILITY_MANAGE,
            P.ENQUIRY_MANAGE,
            P.VIEWING_MANAGE,
            P.VERIFICATION_SUBMIT,
        ],
    ),
    "data_partner": (
        "Local Data Collection Partner",
        "Collects authorized property information in an assigned area",
        [P.PROPERTY_CREATE, P.DATA_COLLECT, P.VERIFICATION_SUBMIT, P.PARTNER_ASSIGNMENT],
    ),
    "finding_partner": (
        "Local Property-Finding Partner",
        "Investigates local availability and coordinates assigned assisted searches",
        [P.PARTNER_ASSIGNMENT, P.PARTNER_REPORTS, P.VIEWING_MANAGE],
    ),
    "support_officer": (
        "Support Officer",
        "Processes assisted searches and seeker communication",
        [
            P.SUPPORT_VIEW,
            P.SUPPORT_MESSAGE,
            P.ASSISTED_MANAGE,
            P.VIEWING_MANAGE,
            P.ENQUIRY_MANAGE,
            P.COMPLAINT_MANAGE,
        ],
    ),
    "verification_officer": (
        "Verification Officer",
        "Reviews identity, authority and inspection evidence",
        [P.PROPERTY_VERIFY, P.VERIFICATION_SUBMIT, P.SUPPORT_VIEW],
    ),
    "moderator": (
        "Moderator",
        "Moderates listings, reports and misleading content",
        [P.PROPERTY_MODERATE, P.COMPLAINT_MANAGE, P.SUPPORT_VIEW],
    ),
    "finance_officer": (
        "Finance Officer",
        "Reconciles payments, invoices and refunds",
        [P.PAYMENT_VIEW, P.PAYMENT_REFUND, P.ANALYTICS_VIEW],
    ),
    "super_admin": (
        "Super Administrator",
        "Full platform administration with audited actions",
        list(DEFAULT_PERMISSIONS.keys()),
    ),
}

SELF_SERVICE_ROLES = {
    "property_seeker",
    "landlord",
    "property_manager",
    "data_partner",
    "finding_partner",
}


@dataclass(frozen=True)
class ResourceRef:
    kind: str
    id: str


def permissions_for_roles(role_codes: list[str]) -> set[str]:
    result: set[str] = set()
    for code in role_codes:
        definition = ROLE_DEFINITIONS.get(code)
        if definition:
            result.update(definition[2])
    return result


def is_staff(role_codes: list[str]) -> bool:
    return bool(
        set(role_codes)
        & {
            "support_officer",
            "verification_officer",
            "moderator",
            "finance_officer",
            "super_admin",
        }
    )
