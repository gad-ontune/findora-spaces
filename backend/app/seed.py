"""Seed Findora Spaces with realistic demo data.

All seeded listings are fictional and illustrative. They exist so the platform can be
demonstrated end-to-end without inventing verification results at request time.
Run:

    python -m app.seed --if-empty
    python -m app.seed --reset      # destructive: drops and recreates all tables
"""

from __future__ import annotations

import argparse
import json
import math
import random
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bootstrap import bootstrap
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, init_db
from app.core.security import hash_password
from app.models import (
    Amenity,
    AuditLog,
    CommercialDetail,
    CommercialUse,
    Complaint,
    Country,
    County,
    Favourite,
    FieldReport,
    Invoice,
    Landmark,
    Locality,
    Neighbourhood,
    Notification,
    PartnerAssignment,
    PartnerProfile,
    PartnerServiceArea,
    Payment,
    Promotion,
    Property,
    PropertyAmenity,
    PropertyAvailability,
    PropertyCommercialUse,
    PropertyComparison,
    PropertyEnquiry,
    PropertyHistoryEvent,
    PropertyInspection,
    PropertyLocation,
    PropertyManager,
    PropertyMedia,
    PropertyOwner,
    PropertyReport,
    PropertyStatusHistory,
    Refund,
    RentalTerm,
    RentalUnit,
    ResidentialDetail,
    Role,
    SavedSearch,
    SearchRequest,
    ShortlistComment,
    ShortlistMember,
    SharedShortlist,
    SubCounty,
    Subscription,
    SubscriptionPlan,
    SupportTicket,
    SystemSetting,
    Town,
    User,
    UserProfile,
    VerificationEvidence,
    VerificationRecord,
    Viewing,
    ViewingFeedback,
    ViewingStatusHistory,
    RequestMatch,
    RequestMessage,
    RequestStatusHistory,
)
from app.models.base import (
    AssignmentStatus,
    AvailabilityStatus,
    PaymentStatus,
    PropertyStatus,
    SearchRequestStatus,
    VerificationStatus,
    VerificationType,
    ViewingStatus,
)
from app.services.location_service import point_wkt
from app.services.subscription_service import PLAN_PERIOD_DAYS, ensure_default_plans

DEMO_PASSWORD = {
    "admin@findora.co.ke": "Admin123!",
    "landlord@findora.co.ke": "Landlord123!",
    "landlord2@findora.co.ke": "Landlord123!",
    "manager@findora.co.ke": "Manager123!",
    "seeker@findora.co.ke": "Seeker123!",
    "partner@findora.co.ke": "Partner123!",
    "data@findora.co.ke": "Data123!",
    "support@findora.co.ke": "Support123!",
    "verifier@findora.co.ke": "Verify123!",
    "moderator@findora.co.ke": "Moderate123!",
    "finance@findora.co.ke": "Finance123!",
}

COUNTIES = [
    ("001", "Mombasa"), ("002", "Kwale"), ("003", "Kilifi"), ("004", "Tana River"),
    ("005", "Lamu"), ("006", "Taita Taveta"), ("007", "Garissa"), ("008", "Wajir"),
    ("009", "Mandera"), ("010", "Marsabit"), ("011", "Isiolo"), ("012", "Meru"),
    ("013", "Tharaka Nithi"), ("014", "Embu"), ("015", "Kitui"), ("016", "Machakos"),
    ("017", "Makueni"), ("018", "Nyandarua"), ("019", "Nyeri"), ("020", "Kirinyaga"),
    ("021", "Murang'a"), ("022", "Kiambu"), ("023", "Turkana"), ("024", "West Pokot"),
    ("025", "Samburu"), ("026", "Trans Nzoia"), ("027", "Uasin Gishu"),
    ("028", "Elgeyo Marakwet"), ("029", "Nandi"), ("030", "Baringo"),
    ("031", "Laikipia"), ("032", "Nakuru"), ("033", "Narok"), ("034", "Kajiado"),
    ("035", "Kericho"), ("036", "Bomet"), ("037", "Kakamega"), ("038", "Vihiga"),
    ("039", "Bungoma"), ("040", "Busia"), ("041", "Siaya"), ("042", "Kisumu"),
    ("043", "Homa Bay"), ("044", "Migori"), ("045", "Kisii"), ("046", "Nyamira"),
    ("047", "Nairobi City"),
]

# County headquarters / principal towns so the platform is ready nationwide.
COUNTY_TOWNS = {
    "001": ("Mombasa", -4.0435, 39.6682),
    "002": ("Kwale", -4.1737, 39.4521),
    "003": ("Kilifi", -3.5107, 39.9093),
    "004": ("Hola", -1.4990, 40.0297),
    "005": ("Lamu", -2.2717, 40.9020),
    "006": ("Voi", -3.3961, 38.5561),
    "007": ("Garissa", -0.4536, 39.6461),
    "008": ("Wajir", 1.7471, 40.0573),
    "009": ("Mandera", 3.9373, 41.8670),
    "010": ("Marsabit", 2.3347, 37.9900),
    "011": ("Isiolo", 0.3546, 37.5822),
    "012": ("Meru", 0.0463, 37.6559),
    "013": ("Kathwana", -0.3460, 37.8660),
    "014": ("Embu", -0.5310, 37.4500),
    "015": ("Kitui", -1.3670, 38.0106),
    "016": ("Machakos", -1.5177, 37.2634),
    "017": ("Wote", -1.7800, 37.6280),
    "018": ("Ol Kalou", -0.2730, 36.3790),
    "019": ("Nyeri", -0.4167, 36.9500),
    "020": ("Kerugoya", -0.4989, 37.2803),
    "021": ("Murang'a", -0.7167, 37.1500),
    "022": ("Kiambu", -1.1714, 36.8356),
    "023": ("Lodwar", 3.1191, 35.5973),
    "024": ("Kapenguria", 1.2389, 35.1119),
    "025": ("Maralal", 1.0968, 36.6980),
    "026": ("Kitale", 1.0157, 35.0062),
    "027": ("Eldoret", 0.5143, 35.2698),
    "028": ("Iten", 0.6703, 35.5081),
    "029": ("Kapsabet", 0.2030, 35.1050),
    "030": ("Kabarnet", 0.4919, 35.7430),
    "031": ("Nanyuki", -0.0167, 37.0731),
    "032": ("Nakuru", -0.3031, 36.0800),
    "033": ("Narok", -1.0877, 35.8711),
    "034": ("Kajiado", -1.8522, 36.7768),
    "035": ("Kericho", -0.3689, 35.2863),
    "036": ("Bomet", -0.7813, 35.3416),
    "037": ("Kakamega", 0.2827, 34.7519),
    "038": ("Mbale", 0.0833, 34.7167),
    "039": ("Bungoma", 0.5635, 34.5606),
    "040": ("Busia", 0.4608, 34.1115),
    "041": ("Siaya", 0.0611, 34.2882),
    "042": ("Kisumu", -0.0917, 34.7680),
    "043": ("Homa Bay", -0.5273, 34.4571),
    "044": ("Migori", -1.0634, 34.4731),
    "045": ("Kisii", -0.6817, 34.7667),
    "046": ("Nyamira", -0.5633, 34.9358),
    "047": ("Nairobi", -1.2921, 36.8219),
}

# Real sub-county names for the launch county; other counties get a generic
# headquarters sub-county that can be replaced as coverage expands.
MIGORI_SUBCOUNTIES = ["Kuria East", "Kuria West", "Suna East", "Suna West", "Uriri", "Rongo", "Awendo", "Nyatike"]

KEHANCHA_NEIGHBOURHOODS = [
    ("Kehancha Town Centre", "kehancha-town-centre", -1.2466, 34.6181, "Walkable commercial centre close to the market and bus stage."),
    ("Kariobangi", "kariobangi", -1.2422, 34.6140, "Dense residential area with many bedsitters and small shops."),
    ("Amani", "amani", -1.2500, 34.6210, "Quiet residential streets a short walk from the sub-county hospital."),
    ("Sokoni", "sokoni", -1.2440, 34.6205, "Market-side neighbourhood suited to traders and small businesses."),
    ("Nyabohanse Road", "nyabohanse-road", -1.2515, 34.6120, "Growing residential corridor towards Nyabohanse."),
    ("Migori Road", "migori-road", -1.2400, 34.6260, "Main road corridor with shops, services and matatu access."),
    ("Kisii Road", "kisii-road", -1.2520, 34.6060, "Residential corridor towards Kisii with larger compounds."),
    ("Nyametaburo", "nyametaburo", -1.2580, 34.6240, "Family neighbourhood near schools and churches."),
    ("Matongo", "matongo", -1.2360, 34.6090, "Peri-urban area with maisonettes and larger plots."),
    ("Nyakweri", "nyakweri", -1.2550, 34.6300, "Affordable rental area east of the town centre."),
]

KEHANCHA_LANDMARKS = [
    ("Kehancha Market", "market", -1.2462, 34.6172, "Kehancha", "Public market"),
    ("Kehancha Bus Stage", "transport", -1.2457, 34.6193, "Kehancha", "Matatu and boda-boda stage"),
    ("Kehancha Sub-County Hospital", "health", -1.2493, 34.6218, "Kehancha", "Public hospital"),
    ("Kuria East Sub-County Offices", "government", -1.2478, 34.6164, "Kehancha", "Government offices"),
    ("Kehancha Primary School", "education", -1.2511, 34.6138, "Kehancha", "Public primary school"),
    ("Kehancha Secondary School", "education", -1.2574, 34.6237, "Kehancha", "Public secondary school"),
    ("Kehancha Catholic Church", "worship", -1.2357, 34.6094, "Kehancha", "Catholic parish"),
    ("Kehancha Shopping Centre", "shopping", -1.2468, 34.6188, "Kehancha", "Shops and services"),
    ("Kuria East Police Station", "security", -1.2482, 34.6198, "Kehancha", "Police station"),
    ("Migori County Stadium", "recreation", -1.0660, 34.4720, "Migori", "Public stadium"),
    ("Migori County Referral Hospital", "health", -1.0630, 34.4790, "Migori", "Referral hospital"),
    ("Migori Post Office", "government", -1.0642, 34.4725, "Migori", "Postal services"),
]

AMENITIES = [
    ("Reliable water supply", "reliable-water", "utilities", "both", "droplet"),
    ("Piped water", "piped-water", "utilities", "both", "droplet"),
    ("Borehole water", "borehole-water", "utilities", "both", "droplet"),
    ("Water storage tank", "water-tank", "utilities", "both", "tank"),
    ("Mains electricity", "electricity", "utilities", "both", "bolt"),
    ("Three-phase power", "three-phase-power", "utilities", "commercial", "bolt"),
    ("Backup generator", "backup-generator", "utilities", "both", "generator"),
    ("Solar power", "solar-power", "utilities", "both", "sun"),
    ("Security guard", "security-guard", "security", "both", "shield"),
    ("CCTV", "cctv", "security", "both", "camera"),
    ("Security lights", "security-lights", "security", "both", "light"),
    ("Gated compound", "gated-compound", "security", "both", "gate"),
    ("Parking", "parking", "outdoor", "both", "car"),
    ("Covered parking", "covered-parking", "outdoor", "both", "car"),
    ("Tiled floors", "tiled-floors", "interior", "both", "tile"),
    ("Built-in wardrobes", "wardrobes", "interior", "residential", "wardrobe"),
    ("Kitchen cabinets", "kitchen-cabinets", "interior", "residential", "kitchen"),
    ("Private bathroom", "private-bathroom", "interior", "residential", "bath"),
    ("Hot shower", "hot-shower", "interior", "residential", "shower"),
    ("Balcony", "balcony", "outdoor", "residential", "balcony"),
    ("Garden", "garden", "outdoor", "residential", "tree"),
    ("Fibre internet ready", "fibre-internet", "utilities", "both", "wifi"),
    ("Air conditioning", "air-conditioning", "interior", "both", "snow"),
    ("Lift", "lift", "accessibility", "both", "lift"),
    ("Wheelchair access", "wheelchair-access", "accessibility", "both", "wheelchair"),
    ("Shop frontage", "shop-frontage", "commercial", "commercial", "shop"),
    ("Loading access", "loading-access", "commercial", "commercial", "truck"),
    ("Storage room", "storage-room", "commercial", "commercial", "box"),
    ("Waste collection", "waste-collection", "utilities", "both", "bin"),
    ("Near matatu stage", "near-matatu", "location", "both", "bus"),
    ("Near a school", "near-school", "location", "both", "school"),
    ("Near a market", "near-market", "location", "both", "market"),
    ("Paved access road", "paved-access", "location", "both", "road"),
]

COMMERCIAL_USES = [
    ("General retail shop", "general-retail", "Everyday retail and convenience goods"),
    ("Office", "office", "Office and professional workspace use"),
    ("Restaurant or cafe", "restaurant-cafe", "Food preparation and seated dining"),
    ("Salon or barbershop", "salon-barbershop", "Personal care and grooming"),
    ("Pharmacy", "pharmacy", "Retail pharmacy subject to licensing"),
    ("Warehouse", "warehouse", "Storage and distribution"),
    ("Workshop", "workshop", "Light manufacturing, repair or fabrication"),
    ("Supermarket", "supermarket", "Larger-format grocery retail"),
    ("Clinic", "clinic", "Outpatient health services subject to licensing"),
    ("Agrovet", "agrovet", "Agricultural inputs and veterinary supplies"),
    ("Boutique", "boutique", "Clothing and fashion retail"),
    ("Electronics shop", "electronics", "Electronics sales and repair"),
    ("Mobile money agent", "mobile-money", "Mobile money and agency services"),
    ("Bakery", "bakery", "Baking and bakery retail"),
    ("Bar or lounge", "bar-lounge", "Licensed beverage service"),
    ("Gym", "gym", "Fitness and training space"),
]

# ── Illustrative demo media ──────────────────────────────────────────────────

PALETTES = [
    ((238, 232, 219), (203, 213, 199), (177, 124, 88)),
    ((232, 238, 236), (185, 205, 198), (44, 95, 91)),
    ((244, 236, 222), (223, 203, 176), (180, 116, 82)),
    ((226, 234, 230), (196, 214, 208), (72, 103, 92)),
    ((241, 233, 225), (211, 196, 178), (150, 112, 83)),
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _gradient(size, top, bottom):
    width, height = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img


def _window(draw, box, sky, frame=(250, 250, 245)):
    draw.rectangle(box, fill=frame)
    inner = (box[0] + 10, box[1] + 10, box[2] - 10, box[3] - 10)
    draw.rectangle(inner, fill=sky)
    midx = (inner[0] + inner[2]) // 2
    midy = (inner[1] + inner[3]) // 2
    draw.line([(midx, inner[1]), (midx, inner[3])], fill=frame, width=8)
    draw.line([(inner[0], midy), (inner[2], midy)], fill=frame, width=8)


def _plant(draw, x, y, scale=1.0, pot=(166, 102, 70), leaf=(71, 111, 86)):
    pot_w = int(34 * scale)
    pot_h = int(42 * scale)
    draw.polygon(
        [(x - pot_w, y), (x + pot_w, y), (x + int(22 * scale), y + pot_h), (x - int(22 * scale), y + pot_h)],
        fill=pot,
    )
    for dx, dy in ((0, -52), (-18, -38), (18, -40), (-10, -64), (12, -60)):
        draw.ellipse(
            (x + dx * scale - 16 * scale, y + dy * scale - 12 * scale,
             x + dx * scale + 16 * scale, y + dy * scale + 12 * scale),
            fill=leaf,
        )


def _label(img, text):
    draw = ImageDraw.Draw(img)
    font = _font(20)
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    x = img.width - width - 28
    y = img.height - 42
    draw.rounded_rectangle((x - 12, y - 8, img.width - 16, y + 30), radius=8, fill=(20, 41, 39))
    draw.text((x, y), text, font=font, fill=(246, 239, 228))


def _draw_room(draw, palette, kind):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 600), fill=wall)
    draw.rectangle((0, 600, 1200, 800), fill=floor)
    draw.line((0, 600, 1200, 600), fill=tuple(max(0, c - 25) for c in floor), width=6)
    _window(draw, (690, 150, 1080, 460), (178, 213, 224))
    if kind == "bedroom":
        draw.rectangle((120, 410, 570, 610), fill=(250, 247, 239))
        draw.rectangle((120, 410, 570, 490), fill=(226, 216, 199))
        draw.rectangle((150, 380, 290, 440), fill=(255, 253, 248))
        draw.rectangle((310, 388, 420, 440), fill=(236, 227, 211))
        draw.rectangle((90, 400, 150, 620), fill=accent)
        draw.rectangle((540, 400, 600, 620), fill=accent)
        draw.rectangle((690, 560, 960, 590), fill=(190, 170, 145))
        draw.rectangle((730, 590, 750, 660), fill=(190, 170, 145))
        draw.rectangle((900, 590, 920, 660), fill=(190, 170, 145))
        _plant(draw, 1060, 600, 1.4)
    elif kind == "kitchen":
        draw.rectangle((80, 430, 660, 610), fill=(233, 224, 208))
        draw.rectangle((80, 400, 660, 435), fill=(190, 160, 128))
        for x in range(120, 640, 110):
            draw.rectangle((x, 445, x + 90, 595), outline=(150, 122, 92), width=3)
        draw.rectangle((300, 455, 400, 505), fill=(180, 196, 199))
        draw.rectangle((330, 445, 370, 455), fill=(130, 150, 152))
        draw.rectangle((720, 210, 1080, 250), fill=(198, 168, 128))
        draw.rectangle((770, 260, 850, 340), fill=(212, 190, 160))
        draw.rectangle((880, 260, 960, 340), fill=(212, 190, 160))
        _plant(draw, 1050, 600, 1.1)
    else:  # living
        draw.rectangle((100, 440, 620, 650), fill=(194, 178, 154))
        draw.rectangle((120, 400, 600, 470), fill=(224, 211, 190))
        draw.rectangle((150, 360, 260, 430), fill=(240, 232, 216))
        draw.rectangle((460, 360, 570, 430), fill=(240, 232, 216))
        draw.rectangle((300, 550, 760, 590), fill=(146, 106, 76))
        draw.rectangle((330, 590, 355, 670), fill=(146, 106, 76))
        draw.rectangle((710, 590, 735, 670), fill=(146, 106, 76))
        draw.ellipse((430, 500, 540, 550), fill=(203, 188, 166))
        draw.rectangle((150, 660, 430, 700), fill=accent)
        _plant(draw, 1000, 610, 1.5)


def _draw_shopfront(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 800), fill=wall)
    draw.polygon([(0, 0), (1200, 0), (1200, 120), (0, 170)], fill=accent)
    draw.rectangle((0, 620, 1200, 800), fill=floor)
    draw.rectangle((110, 240, 520, 640), fill=(208, 226, 230))
    draw.rectangle((130, 260, 500, 620), fill=(175, 207, 214))
    for x in (250, 370):
        draw.line((x, 260, x, 620), fill=(242, 240, 232), width=8)
    draw.rectangle((600, 300, 780, 700), fill=(121, 86, 62))
    draw.rectangle((620, 320, 760, 620), fill=(157, 118, 85))
    draw.ellipse((740, 540, 758, 558), fill=(230, 200, 120))
    draw.rectangle((830, 300, 1080, 640), fill=(203, 226, 231))
    draw.rectangle((850, 320, 1060, 620), fill=(170, 204, 211))
    draw.rectangle((820, 250, 1090, 300), fill=(240, 236, 224))
    draw.text((860, 263), "SHOP", font=_font(24), fill=accent)
    _plant(draw, 1160, 700, 0.8)


def _draw_office(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 800), fill=wall)
    draw.rectangle((0, 650, 1200, 800), fill=floor)
    _window(draw, (80, 120, 600, 470), (170, 205, 217))
    draw.rectangle((720, 420, 1130, 470), fill=(164, 133, 101))
    draw.rectangle((760, 470, 790, 650), fill=(130, 103, 79))
    draw.rectangle((1060, 470, 1090, 650), fill=(130, 103, 79))
    draw.rectangle((790, 330, 1030, 395), fill=(43, 67, 66))
    draw.rectangle((860, 395, 880, 420), fill=(43, 67, 66))
    draw.rounded_rectangle((560, 500, 760, 640), radius=16, fill=accent)
    draw.rounded_rectangle((590, 440, 730, 530), radius=18, fill=accent)
    _plant(draw, 1130, 650, 1.2)
    draw.rectangle((80, 560, 420, 590), fill=(205, 194, 176))
    draw.rectangle((100, 590, 120, 660), fill=(160, 140, 115))
    draw.rectangle((380, 590, 400, 660), fill=(160, 140, 115))


def _draw_restaurant(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 800), fill=wall)
    draw.rectangle((0, 630, 1200, 800), fill=floor)
    draw.rectangle((70, 120, 530, 500), fill=(182, 212, 219))
    draw.rectangle((90, 140, 510, 480), fill=(153, 195, 203))
    draw.rectangle((680, 200, 750, 380), fill=(217, 179, 116))
    draw.polygon([(670, 380), (760, 380), (735, 430), (695, 430)], fill=(217, 179, 116))
    draw.ellipse((640, 180, 790, 240), fill=(238, 223, 191))
    for cx in (300, 900):
        draw.ellipse((cx - 90, 610, cx + 90, 660), fill=(197, 180, 157))
        draw.rectangle((cx - 15, 660, cx + 15, 740), fill=(130, 96, 70))
        draw.rectangle((cx - 100, 550, cx - 60, 620), fill=accent)
        draw.rectangle((cx + 60, 550, cx + 100, 620), fill=accent)
    _plant(draw, 1120, 620, 1.2)


def _draw_warehouse(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 560), fill=(213, 217, 211))
    draw.rectangle((0, 560, 1200, 800), fill=(158, 158, 150))
    for x in (550, 740, 930):
        draw.rectangle((x, 140, x + 150, 560), fill=(104, 118, 114))
        for shelf_y in (240, 360, 480):
            draw.rectangle((x, shelf_y, x + 150, shelf_y + 8), fill=(190, 190, 180))
            for bx in range(x + 14, x + 145, 44):
                draw.rectangle((bx, shelf_y - 42, bx + 34, shelf_y), fill=accent)
    draw.rectangle((90, 220, 430, 560), fill=(135, 147, 143))
    draw.rectangle((110, 240, 410, 560), fill=(180, 189, 183))
    for y in range(280, 560, 80):
        draw.line((110, y, 410, y), fill=(150, 160, 155), width=6)
    draw.rectangle((0, 560, 1200, 585), fill=(120, 124, 118))


def _draw_salon(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 800), fill=wall)
    draw.rectangle((0, 620, 1200, 800), fill=floor)
    draw.rectangle((130, 130, 470, 500), fill=(234, 226, 210))
    draw.rectangle((150, 150, 450, 480), fill=(188, 216, 220))
    draw.rectangle((630, 140, 1060, 470), fill=(208, 194, 176))
    draw.rectangle((650, 160, 1040, 450), fill=(238, 231, 218))
    draw.ellipse((780, 250, 910, 420), fill=(213, 201, 184))
    draw.rectangle((260, 520, 560, 580), fill=accent)
    draw.ellipse((320, 440, 500, 530), fill=(69, 63, 58))
    draw.rectangle((360, 580, 390, 690), fill=(130, 103, 79))
    draw.rectangle((470, 580, 500, 690), fill=(130, 103, 79))
    _plant(draw, 1120, 620, 1.1)


def _draw_workshop(draw, palette):
    wall, floor, accent = palette
    draw.rectangle((0, 0, 1200, 800), fill=wall)
    draw.rectangle((0, 620, 1200, 800), fill=(146, 148, 142))
    for x in (100, 300, 500):
        draw.rectangle((x, 120, x + 150, 400), fill=(183, 176, 160))
        for y in (200, 280, 360):
            draw.line((x, y, x + 150, y), fill=(140, 133, 118), width=6)
    draw.rectangle((760, 430, 1090, 500), fill=(118, 111, 100))
    draw.rectangle((790, 500, 820, 660), fill=(90, 85, 77))
    draw.rectangle((1030, 500, 1060, 660), fill=(90, 85, 77))
    draw.rectangle((820, 370, 900, 430), fill=(150, 50, 44))
    draw.rectangle((930, 390, 990, 430), fill=(70, 95, 118))
    draw.rectangle((100, 520, 320, 600), fill=accent)


def _draw_exterior(draw, palette):
    wall, floor, accent = palette
    sky = _gradient((1200, 530), (174, 207, 216), (232, 233, 219)).copy()
    draw._image.paste(sky, (0, 0)) if hasattr(draw, "_image") else None
    draw.rectangle((0, 0, 1200, 520), fill=(186, 214, 219))
    draw.rectangle((0, 520, 1200, 800), fill=(151, 168, 119))
    draw.polygon([(250, 520), (600, 250), (950, 520)], fill=(174, 111, 77))
    draw.rectangle((330, 500, 870, 720), fill=(238, 230, 213))
    draw.rectangle((390, 560, 500, 720), fill=(120, 153, 158))
    draw.rectangle((560, 560, 700, 720), fill=(120, 153, 158))
    draw.rectangle((750, 560, 830, 720), fill=(133, 99, 70))
    draw.rectangle((0, 700, 1200, 740), fill=(200, 195, 177))
    for x, scale in ((120, 1.3), (1030, 1.5), (960, 0.9)):
        draw.rectangle((x - 8, 600, x + 8, 730), fill=(103, 78, 57))
        draw.ellipse((x - 55 * scale, 470 - 40 * scale, x + 55 * scale, 610), fill=(84, 122, 87))
    draw.ellipse((1030, 90, 1130, 190), fill=(248, 237, 202))


SCENES = {
    "bedroom": lambda d, p: _draw_room(d, p, "bedroom"),
    "living": lambda d, p: _draw_room(d, p, "living"),
    "kitchen": lambda d, p: _draw_room(d, p, "kitchen"),
    "shopfront": _draw_shopfront,
    "office": _draw_office,
    "restaurant": _draw_restaurant,
    "warehouse": _draw_warehouse,
    "salon": _draw_salon,
    "workshop": _draw_workshop,
    "exterior": _draw_exterior,
}


def generate_image(path: Path, scene: str, palette_index: int) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    palette = PALETTES[palette_index % len(PALETTES)]
    img = Image.new("RGB", (1200, 800), palette[0])
    draw = ImageDraw.Draw(img)
    # Make exterior scene work with a plain ImageDraw surface.
    if scene == "exterior":
        draw.rectangle((0, 0, 1200, 520), fill=(186, 214, 219))
        draw.rectangle((0, 520, 1200, 800), fill=(151, 168, 119))
        draw.ellipse((960, 70, 1090, 200), fill=(248, 237, 202))
        draw.polygon([(250, 520), (600, 250), (950, 520)], fill=(174, 111, 77))
        draw.rectangle((330, 500, 870, 720), fill=(238, 230, 213))
        draw.rectangle((390, 560, 500, 720), fill=(120, 153, 158))
        draw.rectangle((560, 560, 700, 720), fill=(120, 153, 158))
        draw.rectangle((750, 560, 830, 720), fill=(133, 99, 70))
        draw.rectangle((0, 700, 1200, 740), fill=(200, 195, 177))
        for x, scale in ((120, 1.3), (1030, 1.5), (960, 0.9)):
            draw.rectangle((x - 8, 600, x + 8, 730), fill=(103, 78, 57))
            draw.ellipse((x - 55 * scale, 470 - 40 * scale, x + 55 * scale, 610), fill=(84, 122, 87))
    else:
        SCENES[scene](draw, palette)
    _label(img, "Findora · illustrative demo image")
    img.save(path, "WEBP", quality=82, method=4)


# ── Demo listings ────────────────────────────────────────────────────────────

PROPERTIES = [
    {
        "key": "bedsitter-kariobangi", "title": "Bright bedsitter near Kehancha town centre",
        "category": "residential", "property_type": "bedsitter", "neighbourhood": "kariobangi",
        "landmark": "Kehancha Market", "address": "Off Kehancha–Migori Road, Kariobangi",
        "offset": (0.0040, -0.0040), "rent": 5500, "deposit": 5500, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 0,
        "amenities": ["water-tank", "tiled-floors", "security-lights", "private-bathroom", "near-matatu"],
        "verified": 6, "featured": True, "fresh": 1, "views": 284, "contacts": 23,
        "description": "A well-lit bedsitter in Kariobangi with a private bathroom, tiled floors and a kitchenette. The compound has security lighting and a shared water tank, and the matatu stage is a short walk away. Rent is advertised monthly; water is billed separately by the landlord.",
        "owner": "landlord",
    },
    {
        "key": "two-bed-amani", "title": "Two-bedroom apartment with balcony near Kehancha Hospital",
        "category": "residential", "property_type": "two_bedroom", "neighbourhood": "amani",
        "landmark": "Kehancha Sub-County Hospital", "address": "Amani Estate, off Hospital Road",
        "offset": (0.0030, 0.0040), "rent": 15000, "deposit": 15000, "bedrooms": 2,
        "bathrooms": 1, "furnishing": "semi_furnished", "parking": 1,
        "amenities": ["parking", "water-tank", "balcony", "gated-compound", "cctv", "kitchen-cabinets", "fibre-internet"],
        "verified": 7, "featured": True, "fresh": 2, "views": 316, "contacts": 31,
        "description": "A two-bedroom apartment on the first floor with a balcony, fitted kitchen cabinets and a secure gated compound. It is a short walk from Kehancha Sub-County Hospital and has a dedicated parking space. Water is stored in a shared tank and electricity is metered per unit.",
        "owner": "landlord", "floor": 1,
    },
    {
        "key": "single-room-sokoni", "title": "Affordable single room in Sokoni",
        "category": "residential", "property_type": "single_room", "neighbourhood": "sokoni",
        "landmark": "Kehancha Market", "address": "Sokoni, near the market",
        "offset": (-0.0025, 0.0015), "rent": 3200, "deposit": 3200, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 0,
        "amenities": ["reliable-water", "security-lights", "near-market", "waste-collection", "paved-access"],
        "verified": 3, "fresh": 5, "views": 142, "contacts": 11, "shared": True,
        "description": "A single room in a quiet block close to Sokoni market, suitable for one person. Water is available at shared taps and there are shared washing areas. The room has its own door and window but shares bathroom facilities. Confirm current availability before paying.",
        "owner": "landlord",
    },
    {
        "key": "three-bed-migori-road", "title": "Three-bedroom family house on Migori Road",
        "category": "residential", "property_type": "three_bedroom", "neighbourhood": "migori-road",
        "landmark": "Kehancha Bus Stage", "address": "Migori Road, opposite a small shopping centre",
        "offset": (0.0060, 0.0100), "rent": 28000, "deposit": 28000, "bedrooms": 3,
        "bathrooms": 2, "furnishing": "unfurnished", "parking": 2,
        "amenities": ["garden", "parking", "water-tank", "security-guard", "gated-compound", "borehole-water", "wardrobes"],
        "verified": 7, "featured": True, "fresh": 1, "views": 401, "contacts": 38,
        "description": "A family house with three bedrooms, two bathrooms, a sitting room and a separate kitchen. The compound is gated with a garden and space for two vehicles. A borehole supplements mains water. The landlord asks for one month's deposit and the first month's rent before move-in.",
        "owner": "landlord2", "manager": True,
    },
    {
        "key": "one-bed-town-centre", "title": "Furnished one-bedroom near Kuria East offices",
        "category": "residential", "property_type": "one_bedroom", "neighbourhood": "kehancha-town-centre",
        "landmark": "Kuria East Sub-County Offices", "address": "Town centre, off the main street",
        "offset": (-0.0010, -0.0020), "rent": 12000, "deposit": 12000, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "furnished", "parking": 0,
        "amenities": ["tiled-floors", "hot-shower", "water-tank", "cctv", "fibre-internet", "kitchen-cabinets"],
        "verified": 6, "fresh": 3, "views": 228, "contacts": 19,
        "description": "A furnished one-bedroom unit with a bed, sofa, dining table and fitted kitchen. It is ideal for a professional working in town and is within walking distance of the sub-county offices. There is CCTV at the entrance and a shared water tank.",
        "owner": "landlord", "floor": 2,
    },
    {
        "key": "studio-amani", "title": "Quiet studio apartment in Amani",
        "category": "residential", "property_type": "studio_apartment", "neighbourhood": "amani",
        "landmark": "Kehancha Sub-County Hospital", "address": "Amani, second street off Hospital Road",
        "offset": (0.0036, 0.0052), "rent": 8500, "deposit": 8500, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "semi_furnished", "parking": 0,
        "amenities": ["water-tank", "tiled-floors", "cctv", "security-lights", "kitchen-cabinets", "paved-access"],
        "verified": 5, "fresh": 4, "views": 176, "contacts": 14,
        "description": "A compact studio with separate sleeping and living areas, a private bathroom and a kitchenette. The block has CCTV and security lights. It is on a quiet street with quick access to the hospital and town centre.",
        "owner": "landlord", "floor": 1,
    },
    {
        "key": "shared-nyametaburo", "title": "Shared accommodation for students in Nyametaburo",
        "category": "residential", "property_type": "shared_accommodation", "neighbourhood": "nyametaburo",
        "landmark": "Kehancha Secondary School", "address": "Nyametaburo, near the secondary school",
        "offset": (-0.0060, 0.0060), "rent": 4000, "deposit": 4000, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 0,
        "amenities": ["reliable-water", "electricity", "security-lights", "near-school", "waste-collection"],
        "verified": 3, "fresh": 6, "views": 118, "contacts": 8, "shared": True,
        "description": "A room in a shared house with other students, with shared kitchen and bathroom facilities. The house is close to Kehancha Secondary School and has a caretaker on site. This is a shared-living arrangement; confirm house rules and the number of occupants before paying.",
        "owner": "landlord2",
    },
    {
        "key": "maisonette-matongo", "title": "Modern maisonette in Matongo",
        "category": "residential", "property_type": "maisonette", "neighbourhood": "matongo",
        "landmark": "Kehancha Catholic Church", "address": "Matongo, off the Kisii road",
        "offset": (0.0120, -0.0110), "rent": 45000, "deposit": 45000, "bedrooms": 4,
        "bathrooms": 3, "furnishing": "unfurnished", "parking": 2,
        "amenities": ["parking", "garden", "borehole-water", "solar-power", "cctv", "security-guard", "gated-compound", "wardrobes", "balcony"],
        "verified": 7, "featured": True, "fresh": 2, "views": 352, "contacts": 27,
        "description": "A spacious four-bedroom maisonette with three bathrooms, a large sitting room and a fitted kitchen. The gated compound has a garden, solar water heating and covered parking for two cars. It is suited to a family looking for a longer lease.",
        "owner": "landlord", "min_lease": 12,
    },
    {
        "key": "bungalow-kisii-road", "title": "Bungalow with a large compound on Kisii Road",
        "category": "residential", "property_type": "bungalow", "neighbourhood": "kisii-road",
        "landmark": "Kehancha Primary School", "address": "Kisii Road, after the primary school",
        "offset": (-0.0100, -0.0140), "rent": 35000, "deposit": 35000, "bedrooms": 3,
        "bathrooms": 2, "furnishing": "unfurnished", "parking": 2,
        "amenities": ["garden", "parking", "borehole-water", "water-tank", "security-guard", "gated-compound", "near-school"],
        "verified": 6, "fresh": 8, "views": 205, "contacts": 16, "min_lease": 12,
        "description": "A single-storey family home with three bedrooms, two bathrooms and a large garden. The compound is gated and has a borehole, water tank and parking for two vehicles. It is on the Kisii Road corridor with easy access to schools and the town centre.",
        "owner": "landlord2",
    },
    {
        "key": "apartment-nyakweri", "title": "Budget two-bedroom apartment in Nyakweri",
        "category": "residential", "property_type": "apartment", "neighbourhood": "nyakweri",
        "landmark": "Kehancha Bus Stage", "address": "Nyakweri, off the eastern bypass",
        "offset": (-0.0080, 0.0130), "rent": 11000, "deposit": 11000, "bedrooms": 2,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 1,
        "amenities": ["reliable-water", "security-lights", "parking", "tiled-floors", "paved-access"],
        "verified": 4, "fresh": 10, "views": 163, "contacts": 12,
        "description": "A practical two-bedroom apartment in a quiet block with shared parking and security lighting. The unit has tiled floors and a separate kitchen. It is an affordable option for a small family and is close to public transport.",
        "owner": "landlord2", "floor": 1,
    },
    {
        "key": "shop-market-road", "title": "Retail shop with frontage on Kehancha market road",
        "category": "commercial", "property_type": "shop", "neighbourhood": "kehancha-town-centre",
        "landmark": "Kehancha Market", "address": "Market road, ground floor",
        "offset": (0.0008, -0.0005), "rent": 18000, "deposit": 36000, "floor_area": 28,
        "frontage": 6, "amenities": ["shop-frontage", "three-phase-power", "security-lights", "cctv", "near-market", "waste-collection"],
        "uses": ["general-retail", "boutique", "electronics", "mobile-money"],
        "verified": 6, "featured": True, "fresh": 2, "views": 265, "contacts": 21,
        "lease": 12, "parking": 0,
        "description": "A ground-floor retail unit with 28 square metres of trading space and six metres of frontage on a busy market road. It has a roller shutter, three-phase power and a small storage area. Suitable for convenience retail, a boutique or a mobile-money outlet, subject to licensing.",
        "owner": "landlord2",
    },
    {
        "key": "office-town-centre", "title": "First-floor office suite near Kehancha town centre",
        "category": "commercial", "property_type": "office", "neighbourhood": "kehancha-town-centre",
        "landmark": "Kuria East Sub-County Offices", "address": "Town centre, above a retail row",
        "offset": (-0.0018, 0.0008), "rent": 25000, "deposit": 50000, "floor_area": 60,
        "frontage": 5, "amenities": ["fibre-internet", "parking", "backup-generator", "cctv", "wheelchair-access", "air-conditioning", "three-phase-power"],
        "uses": ["office", "clinic", "mobile-money"],
        "verified": 5, "fresh": 3, "views": 189, "contacts": 13,
        "lease": 24, "floor": "First floor", "parking_spaces": 2,
        "description": "A 60-square-metre first-floor office suite with a reception area and two rooms. The building has backup power, fibre internet readiness and two parking spaces. Lift access is not available; the suite is reached by a wide staircase. Confirm zoning and licensing for your specific use.",
        "owner": "landlord2",
    },
    {
        "key": "restaurant-migori-road", "title": "Restaurant space with kitchen on Migori Road",
        "category": "commercial", "property_type": "restaurant", "neighbourhood": "migori-road",
        "landmark": "Kehancha Bus Stage", "address": "Migori Road, near the bus stage",
        "offset": (0.0050, 0.0090), "rent": 32000, "deposit": 64000, "floor_area": 85,
        "frontage": 9, "amenities": ["loading-access", "three-phase-power", "parking", "water-tank", "waste-collection", "near-matatu", "security-lights"],
        "uses": ["restaurant-cafe", "bar-lounge", "bakery"],
        "verified": 4, "fresh": 4, "views": 172, "contacts": 9,
        "lease": 36, "parking_spaces": 3, "loading": True,
        "description": "An 85-square-metre food-service space with a separate kitchen area, store and customer seating. There is a service entrance and loading access from the side road, plus three parking spaces. Prospective tenants must confirm food-handling licences and zoning with the relevant authorities.",
        "owner": "landlord",
    },
    {
        "key": "salon-sokoni", "title": "Salon or barbershop unit in Sokoni",
        "category": "commercial", "property_type": "salon_barbershop", "neighbourhood": "sokoni",
        "landmark": "Kehancha Market", "address": "Sokoni, market-side row",
        "offset": (-0.0028, 0.0018), "rent": 9500, "deposit": 19000, "floor_area": 18,
        "frontage": 4, "amenities": ["shop-frontage", "reliable-water", "electricity", "near-market", "security-lights", "near-matatu"],
        "uses": ["salon-barbershop", "mobile-money", "boutique"],
        "verified": 5, "fresh": 1, "views": 158, "contacts": 15,
        "lease": 12, "parking": 0,
        "description": "A compact 18-square-metre unit with good visibility from the market road. It has a water connection, single-phase electricity and a small back room for storage. Suitable for a salon, barbershop or small service counter, subject to licensing.",
        "owner": "landlord2",
    },
    {
        "key": "warehouse-kisii-road", "title": "Warehouse with loading yard on Kisii Road",
        "category": "commercial", "property_type": "warehouse", "neighbourhood": "kisii-road",
        "landmark": "Kehancha Primary School", "address": "Kisii Road, after the junction",
        "offset": (-0.0090, -0.0130), "rent": 65000, "deposit": 130000, "floor_area": 220,
        "frontage": 15, "amenities": ["loading-access", "three-phase-power", "security-guard", "parking", "storage-room", "paved-access", "water-tank"],
        "uses": ["warehouse", "workshop"],
        "verified": 6, "fresh": 5, "views": 143, "contacts": 7,
        "lease": 36, "parking_spaces": 4, "loading": True, "power": 30,
        "description": "A 220-square-metre warehouse with a concrete floor, roller door and a secure loading yard. Three-phase power is available and the compound has a guard and parking for delivery vehicles. The access road is paved. Confirm permitted use and any county approvals before signing.",
        "owner": "landlord2",
    },
    {
        "key": "workshop-bus-stage", "title": "Workshop unit near Kehancha bus stage",
        "category": "commercial", "property_type": "workshop", "neighbourhood": "migori-road",
        "landmark": "Kehancha Bus Stage", "address": "Migori Road service lane",
        "offset": (0.0045, 0.0085), "rent": 22000, "deposit": 44000, "floor_area": 70,
        "frontage": 7, "amenities": ["loading-access", "three-phase-power", "reliable-water", "cctv", "paved-access", "storage-room"],
        "uses": ["workshop", "warehouse", "electronics"],
        "verified": 3, "fresh": 9, "views": 107, "contacts": 5,
        "lease": 24, "loading": True,
        "description": "A 70-square-metre workshop with a wide service door, storage area and three-phase power. It is a short distance from the bus stage and has a paved access lane. Suitable for light repair, fabrication or assembly work; confirm that your use complies with county requirements.",
        "owner": "landlord",
    },
    {
        "key": "pending-two-bed-kariobangi", "title": "Newly built two-bedroom in Kariobangi",
        "category": "residential", "property_type": "two_bedroom", "neighbourhood": "kariobangi",
        "landmark": "Kehancha Market", "address": "Kariobangi, new block",
        "offset": (0.0045, -0.0048), "rent": 13500, "deposit": 13500, "bedrooms": 2,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 1,
        "amenities": ["water-tank", "tiled-floors", "parking", "security-lights"],
        "verified": 1, "status": "pending", "fresh": 0, "views": 0, "contacts": 0,
        "description": "A newly completed two-bedroom unit awaiting moderation. The listing includes a sitting room, kitchen and one bathroom. It is shown here only in the owner's dashboard until a moderator approves it and availability is confirmed.",
        "owner": "landlord",
    },
    {
        "key": "pending-shop-market", "title": "Shop opposite Kehancha market",
        "category": "commercial", "property_type": "shop", "neighbourhood": "sokoni",
        "landmark": "Kehancha Market", "address": "Market frontage, Sokoni",
        "offset": (-0.0020, 0.0010), "rent": 16500, "deposit": 33000, "floor_area": 24,
        "frontage": 5, "amenities": ["shop-frontage", "electricity", "near-market"],
        "uses": ["general-retail", "pharmacy", "agrovet"],
        "verified": 1, "status": "pending", "fresh": 0, "views": 0, "contacts": 0,
        "lease": 12,
        "description": "A 24-square-metre shop facing the market, submitted for moderation. The owner has provided the rent and frontage details. The listing will remain private until moderation and availability checks are complete.",
        "owner": "landlord2",
    },
    {
        "key": "rejected-bedsitter", "title": "Cheap bedsitter behind town",
        "category": "residential", "property_type": "bedsitter", "neighbourhood": "nyakweri",
        "landmark": "Kehancha Bus Stage", "address": "Nyakweri back lane",
        "offset": (-0.0075, 0.0120), "rent": 2500, "deposit": 2500, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 0,
        "amenities": ["reliable-water", "security-lights"],
        "verified": 1, "status": "rejected", "fresh": 0, "views": 0, "contacts": 0,
        "description": "A low-cost bedsitter that was submitted to Findora. Moderation rejected the listing because the owner could not provide authority to advertise and the photos did not match the stated condition. It is retained here as an example of a rejected submission.",
        "owner": "landlord2", "rejection": "Authority to advertise could not be confirmed and the submitted photos did not match the described unit.",
    },
    {
        "key": "suspended-office", "title": "Commercial office block in town centre",
        "category": "commercial", "property_type": "office", "neighbourhood": "kehancha-town-centre",
        "landmark": "Kehancha Shopping Centre", "address": "Town centre, commercial block",
        "offset": (-0.0015, 0.0005), "rent": 40000, "deposit": 80000, "floor_area": 95,
        "frontage": 6, "amenities": ["fibre-internet", "parking", "backup-generator"],
        "uses": ["office"], "verified": 2, "status": "suspended", "fresh": 3,
        "views": 54, "contacts": 2, "lease": 24,
        "description": "A 95-square-metre office suite that was suspended from public view after a report about an unauthorised representative. The listing remains in the moderation record while ownership and authority are rechecked.",
        "owner": "landlord2", "suspension": "Listing suspended pending re-verification of authority after a user report.",
    },
    {
        "key": "stale-three-bed", "title": "Three-bedroom house on Nyabohanse Road",
        "category": "residential", "property_type": "three_bedroom", "neighbourhood": "nyabohanse-road",
        "landmark": "Kuria East Sub-County Offices", "address": "Nyabohanse Road, residential lane",
        "offset": (-0.0140, -0.0090), "rent": 24000, "deposit": 24000, "bedrooms": 3,
        "bathrooms": 2, "furnishing": "unfurnished", "parking": 1,
        "amenities": ["garden", "parking", "water-tank", "security-lights"],
        "verified": 4, "fresh": 40, "views": 78, "contacts": 4,
        "description": "A three-bedroom house whose availability was last confirmed more than a month ago. Findora does not present it as currently available; the landlord must reconfirm availability before it returns to public search results.",
        "owner": "landlord2",
    },
    {
        "key": "occupied-one-bed", "title": "One-bedroom apartment in Amani",
        "category": "residential", "property_type": "one_bedroom", "neighbourhood": "amani",
        "landmark": "Kehancha Sub-County Hospital", "address": "Amani, second avenue",
        "offset": (0.0032, 0.0046), "rent": 10500, "deposit": 10500, "bedrooms": 1,
        "bathrooms": 1, "furnishing": "unfurnished", "parking": 0,
        "amenities": ["water-tank", "tiled-floors", "security-lights"],
        "verified": 4, "status": "approved", "availability": "occupied", "fresh": 6,
        "views": 96, "contacts": 7,
        "description": "A one-bedroom apartment that has been confirmed occupied. It is retained in the owner's records and is not shown as available in public search. The landlord can update availability when the unit is vacant again.",
        "owner": "landlord",
    },
    {
        "key": "unconfirmed-shop", "title": "Shop unit in Nyakweri",
        "category": "commercial", "property_type": "shop", "neighbourhood": "nyakweri",
        "landmark": "Kehancha Bus Stage", "address": "Nyakweri, roadside block",
        "offset": (-0.0070, 0.0125), "rent": 12000, "deposit": 24000, "floor_area": 20,
        "frontage": 4, "amenities": ["shop-frontage", "electricity", "security-lights"],
        "uses": ["general-retail", "salon-barbershop"],
        "verified": 2, "status": "approved", "availability": "unconfirmed", "fresh": 5,
        "views": 41, "contacts": 1, "lease": 12,
        "description": "A 20-square-metre shop with a roadside frontage. The owner has not confirmed availability recently, so the listing is not presented as currently available. Contact the owner through Findora to reconfirm.",
        "owner": "landlord2",
    },
]


def _dt(days_ago: float = 0, hours: float = 0) -> datetime:
    return datetime.now(UTC) - timedelta(days=days_ago, hours=hours)


def _slugify(value: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in value.lower()).strip("-").replace("--", "-")


def _create_locations(db: Session) -> dict:
    country = Country(name="Kenya", iso_code="KEN")
    db.add(country)
    db.flush()
    counties: dict[str, County] = {}
    towns: dict[str, Town] = {}
    for code, name in COUNTIES:
        county = County(
            country_id=country.id,
            name=name,
            code=code,
            slug=_slugify(name),
        )
        db.add(county)
        counties[code] = county
    db.flush()
    for code, county in counties.items():
        if code == "044":
            sub_names = MIGORI_SUBCOUNTIES
        else:
            sub_names = [f"{county.name} headquarters"]
        for index, sub_name in enumerate(sub_names):
            sub = SubCounty(
                county_id=county.id,
                name=sub_name,
                slug=f"{county.slug}-{_slugify(sub_name)}",
            )
            db.add(sub)
            db.flush()
            if index == 0:
                town_name, lat, lng = COUNTY_TOWNS[code]
                town = Town(
                    sub_county_id=sub.id,
                    name=town_name,
                    slug=f"{_slugify(town_name)}-{code}",
                    latitude=Decimal(str(lat)),
                    longitude=Decimal(str(lng)),
                    geom=point_wkt(lat, lng),
                    description=(
                        "Initial nationwide coverage point. Findora's launch market is Kehancha, "
                        "Migori County; more towns are added as operations expand."
                    ),
                )
                db.add(town)
                towns[code] = town
    db.flush()

    migori = counties["044"]
    kuria_east = next(s for s in migori.sub_counties if s.name == "Kuria East")
    extra_towns = [
        ("Kehancha", -1.2466, 34.6181, "Kuria East", "Launch market: a busy commercial and residential town in Kuria East, Migori County."),
        ("Rongo", -0.8653, 34.5973, "Rongo", "Agricultural and trading town in Migori County."),
        ("Awendo", -1.0333, 34.5333, "Awendo", "Sugar-belt town in Migori County."),
    ]
    for name, lat, lng, sub_name, description in extra_towns:
        sub = next((s for s in migori.sub_counties if s.name == sub_name), kuria_east)
        town = Town(
            sub_county_id=sub.id,
            name=name,
            slug=f"{_slugify(name)}-044",
            latitude=Decimal(str(lat)),
            longitude=Decimal(str(lng)),
            geom=point_wkt(lat, lng),
            description=description,
        )
        db.add(town)
        towns[f"kehancha-{name}" if name == "Kehancha" else f"044-{name}"] = town
    db.flush()
    towns["044-Migori"] = towns["044"]

    kehancha = towns["kehancha-Kehancha"]
    for name, slug, lat, lng, description in KEHANCHA_NEIGHBOURHOODS:
        db.add(
            Neighbourhood(
                town_id=kehancha.id,
                name=name,
                slug=slug,
                latitude=Decimal(str(lat)),
                longitude=Decimal(str(lng)),
                geom=point_wkt(lat, lng),
                description=description,
            )
        )
    db.flush()
    neighbourhoods = {
        n.slug: n
        for n in db.execute(select(Neighbourhood).where(Neighbourhood.town_id == kehancha.id)).scalars().all()
    }
    db.add(
        Locality(
            town_id=kehancha.id,
            neighbourhood_id=neighbourhoods["kehancha-town-centre"].id,
            name="Kehancha CBD",
            slug="kehancha-cbd",
            latitude=Decimal("-1.2466"),
            longitude=Decimal("34.6181"),
        )
    )
    for name, category, lat, lng, area, description in KEHANCHA_LANDMARKS:
        town = kehancha if area == "Kehancha" else towns["044-Migori"]
        db.add(
            Landmark(
                town_id=town.id,
                name=name,
                category=category,
                latitude=Decimal(str(lat)),
                longitude=Decimal(str(lng)),
                geom=point_wkt(lat, lng),
                address=f"{name}, {area}",
                description=description,
                source="Findora pilot reference data",
                last_checked_at=datetime.now(UTC).isoformat(),
            )
        )
    db.flush()
    landmarks = {
        landmark.name: landmark
        for landmark in db.execute(select(Landmark)).scalars().all()
    }
    return {
        "country": country,
        "counties": counties,
        "towns": towns,
        "kehancha": kehancha,
        "neighbourhoods": neighbourhoods,
        "landmarks": landmarks,
    }


def _create_users(db: Session) -> dict[str, User]:
    roles = {r.code: r for r in db.execute(select(Role)).scalars().all()}
    specs = [
        ("admin@findora.co.ke", "Amina Odhiambo", "+254700000001", ["super_admin"], "Platform administrator"),
        ("landlord@findora.co.ke", "Josephine Atieno", "+254700000002", ["landlord", "property_seeker"], "Landlord with residential and commercial listings in Kehancha"),
        ("landlord2@findora.co.ke", "Samuel Ouma", "+254700000003", ["landlord"], "Landlord and shop owner in Migori County"),
        ("manager@findora.co.ke", "Peter Mwangi", "+254700000004", ["property_manager", "property_seeker"], "Property manager acting for authorised owners"),
        ("seeker@findora.co.ke", "Faith Wanjiku", "+254700000005", ["property_seeker"], "Seeker looking for a family home in Kehancha"),
        ("partner@findora.co.ke", "David Otieno", "+254700000006", ["finding_partner"], "Vetted local property-finding partner for Kehancha"),
        ("data@findora.co.ke", "Grace Nyambura", "+254700000007", ["data_partner"], "Local data collection partner for Kuria East"),
        ("support@findora.co.ke", "Hassan Ali", "+254700000008", ["support_officer"], "Assisted search support officer"),
        ("verifier@findora.co.ke", "Mercy Chebet", "+254700000009", ["verification_officer"], "Verification officer for ownership and inspection checks"),
        ("moderator@findora.co.ke", "Brian Kimani", "+254700000010", ["moderator"], "Listing moderator"),
        ("finance@findora.co.ke", "Lucy Njeri", "+254700000011", ["finance_officer"], "Finance officer for payments and reconciliation"),
    ]
    users: dict[str, User] = {}
    for email, name, phone, role_codes, bio in specs:
        user = User(
            name=name,
            phone=phone,
            email=email,
            password_hash=hash_password(DEMO_PASSWORD[email]),
            status="active",
            phone_verified_at=_dt(90),
            is_email_verified=True,
        )
        user.roles = [roles[code] for code in role_codes]
        db.add(user)
        db.flush()
        db.add(
            UserProfile(
                user_id=user.id,
                bio=bio,
                preferred_contact="phone",
                whatsapp=phone,
                locale="en",
                marketing_consent=False,
                data_processing_consent_at=_dt(90),
            )
        )
        users[email.split("@")[0]] = user
    db.flush()
    return users


def _create_reference_data(db: Session) -> None:
    for name, slug, category, applies_to, icon in AMENITIES:
        db.add(
            Amenity(
                name=name,
                slug=slug,
                category=category,
                applies_to=applies_to,
                icon=icon,
                is_active=True,
            )
        )
    for name, slug, description in COMMERCIAL_USES:
        db.add(CommercialUse(name=name, slug=slug, description=description, is_active=True))
    db.flush()


def _verify_record(
    prop: Property,
    verification_type: str,
    status: str,
    days_ago: float,
    verifier: User,
    *,
    evidence: bool = False,
    notes: str | None = None,
) -> VerificationRecord:
    verified_at = _dt(days_ago) if status == VerificationStatus.VERIFIED.value else None
    expires_at = _dt(days_ago) + timedelta(days=180) if status == VerificationStatus.VERIFIED.value else None
    record = VerificationRecord(
        property_id=prop.id,
        verification_type=verification_type,
        status=status,
        evidence_reference=f"seed-{verification_type}-{prop.reference}" if evidence else None,
        responsible_id=verifier.id,
        requested_by_id=prop.created_by_id,
        verified_at=verified_at,
        expires_at=expires_at,
        notes=notes or (
            "Verified during the Findora pilot. Evidence retained in the verification record."
            if status == VerificationStatus.VERIFIED.value
            else "Awaiting independent review."
        ),
        rejection_reason="Evidence did not match the submitted information." if status == VerificationStatus.FAILED.value else None,
    )
    if evidence and status == VerificationStatus.VERIFIED.value:
        record.evidence.append(
            VerificationEvidence(
                kind="document",
                storage_key=f"seed/evidence/{prop.reference}-{verification_type}.pdf",
                description=f"Illustrative {verification_type} evidence reference for the demo dataset",
                uploaded_by_id=verifier.id,
            )
        )
    return record


def _create_property(
    db: Session,
    data: dict,
    users: dict[str, User],
    locations: dict,
    amenity_map: dict[str, Amenity],
    use_map: dict[str, CommercialUse],
) -> Property:
    owner = users[data.get("owner", "landlord")]
    creator = users["manager"] if data.get("manager") else owner
    status = data.get("status", PropertyStatus.APPROVED.value)
    availability = data.get("availability", AvailabilityStatus.AVAILABLE.value)
    fresh_days = data.get("fresh", 2)
    now = datetime.now(UTC)
    is_approved = status == PropertyStatus.APPROVED.value
    is_public = is_approved and availability == AvailabilityStatus.AVAILABLE.value and fresh_days <= 14
    town = locations["kehancha"]
    neighbourhood = locations["neighbourhoods"][data["neighbourhood"]]
    landmark = locations["landmarks"].get(data["landmark"])
    lat = float(neighbourhood.latitude) + data["offset"][0]
    lng = float(neighbourhood.longitude) + data["offset"][1]
    public_lat = round(lat + 0.0018, 6)
    public_lng = round(lng - 0.0012, 6)

    prop = Property(
        reference=f"FND-{len(db.execute(select(Property)).scalars().all()) + 1001:04d}",
        title=data["title"],
        description=data["description"],
        category=data["category"],
        property_type=data["property_type"],
        status=status,
        availability_status=availability,
        owner_id=owner.id,
        created_by_id=creator.id,
        manager_id=users["manager"].id if data.get("manager") else None,
        recorded_owner_name=owner.name if data.get("manager") else None,
        recorded_owner_phone=owner.phone if data.get("manager") else None,
        last_confirmed_available_at=_dt(fresh_days) if availability == AvailabilityStatus.AVAILABLE.value else None,
        last_confirmed_rent_at=_dt(fresh_days + 1) if is_approved else None,
        last_detail_update_at=_dt(min(fresh_days, 10)),
        freshness_days=21 if data["category"] == "commercial" else 14,
        published_at=_dt(max(fresh_days, 1)) if is_public else None,
        moderated_by_id=users["moderator"].id if status in {PropertyStatus.APPROVED.value, PropertyStatus.REJECTED.value, PropertyStatus.SUSPENDED.value} else None,
        moderated_at=_dt(max(fresh_days, 1)) if status in {PropertyStatus.APPROVED.value, PropertyStatus.REJECTED.value, PropertyStatus.SUSPENDED.value} else None,
        rejection_reason=data.get("rejection"),
        suspension_reason=data.get("suspension"),
        is_featured=bool(data.get("featured")) and is_public,
        featured_until=_dt(-14) if data.get("featured") and is_public else None,
        views_count=data.get("views", 0),
        contact_count=data.get("contacts", 0),
    )
    db.add(prop)
    db.flush()

    prop.location = PropertyLocation(
        town_id=town.id,
        neighbourhood_id=neighbourhood.id,
        landmark_id=landmark.id if landmark else None,
        address_line=data["address"],
        latitude_private=Decimal(str(round(lat, 6))),
        longitude_private=Decimal(str(round(lng, 6))),
        latitude_public=Decimal(str(public_lat)),
        longitude_public=Decimal(str(public_lng)),
        precision="approx_200m",
        directions=f"From {data['landmark']}, follow the main access road and turn towards {neighbourhood.name}. Exact directions are shared after a viewing is confirmed.",
        geom_private=point_wkt(lat, lng),
        geom_public=point_wkt(public_lat, public_lng),
    )
    rent = Decimal(str(data["rent"]))
    deposit = Decimal(str(data["deposit"]))
    prop.rental_terms = RentalTerm(
        currency="KES",
        rent_amount=rent,
        deposit_amount=deposit,
        rent_period="monthly",
        agency_fee=Decimal("0"),
        service_fee=Decimal(str(data.get("service_fee", 0))) if data.get("service_fee") else None,
        utility_connection_fee=None,
        other_mandatory_fee=None,
        other_charges=json.dumps([{"label": "Water billed separately where metered", "amount": None}]) if data["category"] == "residential" else None,
        utilities_included=False,
        negotiable=False,
        available_from=date.today() if is_public else None,
        minimum_lease_months=data.get("min_lease", data.get("lease", 1)),
        payment_schedule="Monthly in advance" if data["category"] == "residential" else "Quarterly in advance",
    )
    if data["category"] == "residential":
        prop.residential_detail = ResidentialDetail(
            bedrooms=data.get("bedrooms"),
            bathrooms=data.get("bathrooms"),
            house_style=data["property_type"],
            furnishing=data.get("furnishing", "unfurnished"),
            floor_number=data.get("floor"),
            has_private_bathroom=not bool(data.get("shared")),
            parking_spaces=data.get("parking", 0),
            outdoor_space="Balcony" if "balcony" in data["amenities"] else ("Garden" if "garden" in data["amenities"] else None),
            security_features=json.dumps([a.replace("-", " ").title() for a in data["amenities"] if a in {"cctv", "security-guard", "gated-compound", "security-lights"}]),
            water_source="Borehole and stored mains water" if "borehole-water" in data["amenities"] else "Mains water with storage tank",
            electricity_supply="Mains electricity, token meter",
            shared_accommodation=bool(data.get("shared")),
        )
    else:
        prop.commercial_detail = CommercialDetail(
            floor_area_sqm=Decimal(str(data.get("floor_area", 30))),
            frontage_m=Decimal(str(data.get("frontage", 4))),
            floor_level=data.get("floor", "Ground floor"),
            power_capacity_kva=Decimal(str(data.get("power", 10))),
            parking_spaces=data.get("parking_spaces", data.get("parking", 0)),
            accessibility="Wide door and step-free entrance" if "wheelchair-access" in data["amenities"] else "Standard staircase access; confirm suitability",
            loading_access=bool(data.get("loading")),
            visibility="Direct road frontage" if "shop-frontage" in data["amenities"] else "Service lane frontage",
            road_access="Paved access road" if "paved-access" in data["amenities"] else "Murram access road",
            lease_duration_months=data.get("lease", 12),
            zoning_note="Findora has not confirmed licensing or zoning for a specific business. Confirm permitted use with the relevant county authorities.",
            permitted_use_verified=False,
        )
    for slug in data["amenities"]:
        if slug in amenity_map:
            prop.amenities.append(PropertyAmenity(amenity_id=amenity_map[slug].id))
    for slug in data.get("uses", []):
        if slug in use_map:
            prop.commercial_uses.append(PropertyCommercialUse(commercial_use_id=use_map[slug].id))
    unit = RentalUnit(
        label="Main unit",
        unit_type=data["property_type"],
        bedrooms=data.get("bedrooms"),
        bathrooms=data.get("bathrooms"),
        rent_amount=rent,
        deposit_amount=deposit,
        currency="KES",
        availability_status=availability,
        available_from=date.today() if is_public else None,
    )
    prop.units.append(unit)
    db.flush()
    prop.rental_terms.rental_unit_id = unit.id

    if data.get("manager"):
        prop.manager_links.append(
            PropertyManager(
                user_id=users["manager"].id,
                authorization_reference="SEED-AUTH-001",
                authorized_at=_dt(40),
                status="active",
            )
        )
    prop.owner_links.append(PropertyOwner(user_id=owner.id, relationship_type="owner", verified=is_approved))

    # Illustrative demo media.
    scene_map = {
        "bedsitter": "living", "single_room": "bedroom", "studio_apartment": "living",
        "one_bedroom": "living", "two_bedroom": "living", "three_bedroom": "living",
        "family_house": "exterior", "apartment": "living", "maisonette": "exterior",
        "bungalow": "exterior", "shared_accommodation": "bedroom", "shop": "shopfront",
        "retail_premises": "shopfront", "office": "office", "restaurant": "restaurant",
        "salon_barbershop": "salon", "warehouse": "warehouse", "workshop": "workshop",
        "storage": "warehouse", "business_premises": "office",
    }
    primary_scene = scene_map.get(data["property_type"], "exterior")
    secondary_scene = "kitchen" if data["category"] == "residential" else "office"
    tertiary_scene = "bedroom" if data["category"] == "residential" else "exterior"
    seed_dir = Path(settings.upload_dir) / "seed"
    for index, (scene, caption) in enumerate(
        [
            (primary_scene, "Illustrative view of the advertised space"),
            (secondary_scene, "Illustrative interior layout"),
            (tertiary_scene, "Illustrative demo image"),
        ]
    ):
        filename = f"{data['key']}-{index + 1}.webp"
        path = seed_dir / filename
        generate_image(path, scene, (len(data["key"]) + index + len(data["title"])) % len(PALETTES))
        db.add(
            PropertyMedia(
                property_id=prop.id,
                kind="image",
                url=f"{settings.public_media_base.rstrip('/')}/seed/{filename}",
                storage_key=f"seed/{filename}",
                caption=caption,
                mime_type="image/webp",
                size_bytes=path.stat().st_size if path.exists() else None,
                width=1200,
                height=800,
                is_primary=index == 0,
                sort_order=index,
                consent_confirmed=True,
                uploaded_by_id=creator.id,
            )
        )

    verified_count = int(data.get("verified", 0))
    ordered = [
        VerificationType.PHONE, VerificationType.IDENTITY, VerificationType.OWNERSHIP,
        VerificationType.AUTHORITY, VerificationType.AVAILABILITY, VerificationType.RENT,
        VerificationType.DETAILS, VerificationType.INSPECTION,
    ]
    for index, vtype in enumerate(ordered):
        if status == PropertyStatus.PENDING.value:
            if vtype == VerificationType.PHONE:
                v_status = VerificationStatus.VERIFIED.value
            elif vtype == VerificationType.AVAILABILITY:
                v_status = VerificationStatus.VERIFIED.value
            else:
                v_status = VerificationStatus.PENDING.value
        elif status == PropertyStatus.REJECTED.value:
            if vtype in {VerificationType.PHONE, VerificationType.IDENTITY}:
                v_status = VerificationStatus.VERIFIED.value
            elif vtype in {VerificationType.OWNERSHIP, VerificationType.AUTHORITY}:
                v_status = VerificationStatus.FAILED.value
            else:
                v_status = VerificationStatus.PENDING.value
        elif status == PropertyStatus.SUSPENDED.value:
            v_status = VerificationStatus.VERIFIED.value if index < verified_count else VerificationStatus.PENDING.value
            if vtype == VerificationType.AUTHORITY:
                v_status = VerificationStatus.PENDING.value
        elif fresh_days > 14 and vtype == VerificationType.AVAILABILITY:
            v_status = VerificationStatus.EXPIRED.value
        else:
            v_status = VerificationStatus.VERIFIED.value if index < verified_count else VerificationStatus.PENDING.value
        db.add(
            _verify_record(
                prop,
                vtype.value,
                v_status,
                max(1, fresh_days + 2 + index),
                users["verifier"],
                evidence=index < 4 and v_status == VerificationStatus.VERIFIED.value,
                notes="Verified as part of the Findora pilot demo dataset." if v_status == VerificationStatus.VERIFIED.value else None,
            )
        )
    if availability == AvailabilityStatus.AVAILABLE.value:
        status_value = AvailabilityStatus.AVAILABLE.value
        notes = "Landlord confirmed availability through the Findora pilot."
    elif availability == AvailabilityStatus.OCCUPIED.value:
        status_value = AvailabilityStatus.OCCUPIED.value
        notes = "Confirmed occupied; the landlord will update when vacant."
    else:
        status_value = AvailabilityStatus.UNCONFIRMED.value
        notes = "Availability has not been reconfirmed recently."
    db.add(
        PropertyAvailability(
            property_id=prop.id,
            unit_id=unit.id,
            status=status_value,
            confirmed_at=_dt(fresh_days) if availability == AvailabilityStatus.AVAILABLE.value else _dt(max(fresh_days, 1)),
            confirmed_by_id=owner.id,
            source="landlord",
            next_recheck_at=_dt(fresh_days) + timedelta(days=14),
            notes=notes,
        )
    )
    previous = None
    for to_status, days in (
        (PropertyStatus.PENDING.value, max(fresh_days + 3, 4)),
        (status, max(fresh_days + 1, 2)),
    ):
        db.add(
            PropertyStatusHistory(
                property_id=prop.id,
                from_status=previous,
                to_status=to_status,
                reason="Submitted for moderation" if previous is None else f"Listing {to_status}",
                actor_id=creator.id if previous is None else users["moderator"].id,
                created_at=_dt(days),
            )
        )
        previous = to_status
    db.add(
        PropertyHistoryEvent(
            property_id=prop.id,
            event_type="listing_submitted",
            summary="Property information submitted for review",
            changes=json.dumps({"status": "pending"}),
            visibility="private",
            actor_id=creator.id,
            created_at=_dt(max(fresh_days + 3, 4)),
        )
    )
    if is_public:
        db.add(
            PropertyHistoryEvent(
                property_id=prop.id,
                event_type="listing_approved",
                summary="Listing approved and published",
                changes=json.dumps({"status": "approved"}),
                visibility="public",
                actor_id=users["moderator"].id,
                created_at=_dt(max(fresh_days + 1, 2)),
            )
        )
        db.add(
            PropertyHistoryEvent(
                property_id=prop.id,
                event_type="availability_confirmed",
                summary="Landlord confirmed availability",
                changes=json.dumps({"availability": "available", "confirmed_days_ago": fresh_days}),
                visibility="public",
                actor_id=owner.id,
                created_at=_dt(fresh_days),
            )
        )
    if data.get("rejection"):
        db.add(
            PropertyHistoryEvent(
                property_id=prop.id,
                event_type="listing_rejected",
                summary="Listing rejected during moderation",
                changes=json.dumps({"reason": data["rejection"]}),
                visibility="private",
                actor_id=users["moderator"].id,
                created_at=_dt(2),
            )
        )
    if data.get("suspension"):
        db.add(
            PropertyHistoryEvent(
                property_id=prop.id,
                event_type="listing_suspended",
                summary="Listing suspended pending re-verification",
                changes=json.dumps({"reason": data["suspension"]}),
                visibility="private",
                actor_id=users["moderator"].id,
                created_at=_dt(1),
            )
        )
    if data["category"] == "residential" and "cctv" in data["amenities"] and is_approved:
        db.add(
            PropertyInspection(
                property_id=prop.id,
                inspector_id=users["verifier"].id,
                inspection_date=date.today() - timedelta(days=max(1, fresh_days + 4)),
                exterior_condition="Good",
                interior_condition="Good",
                water_facilities="Running water observed; storage tank present",
                electricity="Metered mains electricity observed",
                doors_windows="Secure; no obvious defects",
                plumbing="No visible leaks",
                access="Accessible by paved or murram road",
                outstanding_concerns="Tenant must confirm water billing arrangement with the landlord.",
                findings=json.dumps({"photos_taken": 6, "occupancy_checked": availability == "available"}),
                status="submitted",
            )
        )
    db.flush()
    return prop


def _create_seeker_data(db: Session, users: dict[str, User], props: dict[str, Property]) -> None:
    seeker = users["seeker"]
    landlord = users["landlord"]
    for key in ("two-bed-amani", "three-bed-migori-road", "office-town-centre"):
        db.add(Favourite(user_id=seeker.id, property_id=props[key].id))
    db.add(
        PropertyComparison(
            user_id=seeker.id,
            property_ids=json.dumps([str(props["two-bed-amani"].id), str(props["three-bed-migori-road"].id)]),
            name="Family homes in Kehancha",
        )
    )
    db.add(
        SavedSearch(
            user_id=seeker.id,
            name="Two-bedroom homes under KES 16,000",
            category="residential",
            filters=json.dumps({"town": "kehancha-044", "bedrooms_min": 2, "max_rent": 16000}),
            notify=True,
        )
    )
    shortlist = SharedShortlist(
        user_id=seeker.id,
        token=secrets.token_urlsafe(24),
        name="Homes to view with my family",
        description="Shortlist shared with my partner before we book viewings.",
    )
    for index, key in enumerate(("two-bed-amani", "three-bed-migori-road", "bungalow-kisii-road")):
        shortlist.members.append(ShortlistMember(property_id=props[key].id, position=index))
    db.add(shortlist)
    db.flush()
    db.add(
        ShortlistComment(
            shortlist_id=shortlist.id,
            author_name="Family member",
            body="The Migori Road house looks like the best fit if the compound is secure.",
        )
    )
    enquiries = [
        ("bedsitter-kariobangi", seeker, "Is the bedsitter still available from the start of next month? I would like to view it on a Saturday.", "new"),
        ("two-bed-amani", seeker, "We are a family of four. Is the balcony unit still available, and is the deposit negotiable?", "responded"),
    ]
    for key, user, message, status in enquiries:
        prop = props[key]
        enquiry = PropertyEnquiry(
            property_id=prop.id,
            seeker_id=user.id,
            landlord_id=prop.created_by_id,
            name=user.name,
            phone=user.phone,
            email=user.email,
            message=message,
            enquiry_type="availability",
            status=status,
            response=(
                "Thank you for your interest. The unit is available and we can arrange a viewing this Saturday at 10am."
                if status == "responded" else None
            ),
            responded_at=_dt(1) if status == "responded" else None,
        )
        db.add(enquiry)
    guest = PropertyEnquiry(
        property_id=props["three-bed-migori-road"].id,
        seeker_id=None,
        landlord_id=props["three-bed-migori-road"].created_by_id,
        name="Kevin M.",
        phone="+254711223344",
        email=None,
        message="I saw this listing while browsing. Are pets allowed and is the stated rent inclusive of water?",
        enquiry_type="enquiry",
        status="new",
    )
    db.add(guest)
    db.flush()
    return None


def _create_assisted(db: Session, users: dict[str, User], props: dict[str, Property], locations: dict) -> dict:
    support = users["support"]
    seeker = users["seeker"]
    partner = users["partner"]
    kehancha = locations["kehancha"]
    county = locations["counties"]["044"]
    neighbourhood = locations["neighbourhoods"]["amani"]
    landmark = locations["landmarks"]["Kehancha Sub-County Hospital"]

    partner_profile = PartnerProfile(
        user_id=partner.id,
        partner_type="finding",
        company_name="Kuria Local Property Finders (demo)",
        status="active",
        phone_alt="+254733445566",
        identification_reference="SEED-ID-2026-001",
        agreement_signed_at=_dt(60),
        rating=Decimal("4.80"),
        response_rate=Decimal("92.50"),
        completed_assignments=14,
        accuracy_score=Decimal("96.00"),
        notes="Demo partner profile. Reflecting real partner operations would require onboarding evidence.",
    )
    partner_profile.service_areas.append(
        PartnerServiceArea(town_id=kehancha.id, neighbourhood_id=locations["neighbourhoods"]["kehancha-town-centre"].id, is_primary=True)
    )
    db.add(partner_profile)
    data_user = users["data"]
    data_profile = PartnerProfile(
        user_id=data_user.id,
        partner_type="data_collection",
        status="active",
        identification_reference="SEED-ID-2026-002",
        agreement_signed_at=_dt(45),
        rating=Decimal("4.60"),
        accuracy_score=Decimal("94.00"),
    )
    data_profile.service_areas.append(PartnerServiceArea(town_id=kehancha.id, is_primary=True))
    db.add(data_profile)
    db.flush()

    request1 = SearchRequest(
        reference="SR-2026-0001",
        secure_token=secrets.token_urlsafe(24),
        user_id=seeker.id,
        guest_name=seeker.name,
        guest_phone=seeker.phone,
        guest_email=seeker.email,
        category="residential",
        county_id=county.id,
        town_id=kehancha.id,
        neighbourhood_id=neighbourhood.id,
        landmark_id=landmark.id,
        budget_min=Decimal("10000"),
        budget_max=Decimal("16000"),
        property_type="two_bedroom",
        bedrooms_min=2,
        move_in_date=date.today() + timedelta(days=20),
        requirements="Two bedrooms, secure compound, reliable water and space for one car. Prefer a unit close to the hospital.",
        contact_method="phone",
        assistance_requirements="Please confirm genuine availability and help arrange a viewing on a Saturday.",
        status=SearchRequestStatus.MATCHES_AVAILABLE.value,
        priority="normal",
        assigned_support_id=support.id,
        consent_to_share=True,
        source="web",
    )
    db.add(request1)
    db.flush()
    for to_status, notes, days, actor in (
        (SearchRequestStatus.SUBMITTED.value, "Request received from the public website", 4, seeker),
        (SearchRequestStatus.RECEIVED.value, "Reviewed by support officer", 4, support),
        (SearchRequestStatus.MATCHING.value, "Matching against approved, fresh listings", 3, support),
        (SearchRequestStatus.MATCHES_AVAILABLE.value, "Two genuine listings matched and shared", 2, support),
    ):
        db.add(RequestStatusHistory(request_id=request1.id, to_status=to_status, notes=notes, actor_id=actor.id, created_at=_dt(days)))
    for key, score, text in (
        ("two-bed-amani", Decimal("91.00"), "Within budget, two bedrooms, gated compound with parking and a balcony. About 1.5 km from the hospital."),
        ("apartment-nyakweri", Decimal("78.50"), "Under budget and two bedrooms, but no private parking and a shorter distance to the bus stage."),
    ):
        prop = props[key]
        db.add(
            RequestMatch(
                request_id=request1.id,
                property_id=prop.id,
                title=prop.title,
                description=prop.description[:500],
                rent_amount=prop.rental_terms.rent_amount,
                location_text=prop.location.neighbourhood.name,
                score=score,
                explanation=json.dumps(
                    {
                        "satisfied": ["Category and property type", "Budget range", "Two bedrooms"],
                        "not_satisfied": ["Exact move-in date must be confirmed"],
                        "message": text,
                    }
                ),
                stage="database",
                status="sent",
                created_by_id=support.id,
            )
        )
    db.add(
        RequestMessage(
            request_id=request1.id,
            sender_id=support.id,
            sender_name=support.name,
            body="We found two possible homes that match your brief. Both are approved and were confirmed available within the last ten days. Please review and tell us which one you would like to view.",
            is_internal=False,
        )
    )
    db.add(
        RequestMessage(
            request_id=request1.id,
            sender_id=seeker.id,
            sender_name=seeker.name,
            body="The Amani apartment looks best. Please confirm whether the deposit is negotiable before we book a viewing.",
            is_internal=False,
        )
    )

    request2 = SearchRequest(
        reference="SR-2026-0002",
        secure_token=secrets.token_urlsafe(24),
        user_id=None,
        guest_name="Cynthia Anyango",
        guest_phone="+254722334455",
        guest_email=None,
        category="commercial",
        county_id=county.id,
        town_id=kehancha.id,
        neighbourhood_id=locations["neighbourhoods"]["sokoni"].id,
        landmark_id=locations["landmarks"]["Kehancha Market"].id,
        budget_min=Decimal("12000"),
        budget_max=Decimal("25000"),
        property_type="shop",
        floor_area_min=Decimal("18"),
        frontage_min=Decimal("4"),
        requirements="A visible shop for a small agrovet, close to the market. Needs reliable water and space for a small store.",
        contact_method="phone",
        status=SearchRequestStatus.UNDER_REVIEW.value,
        priority="normal",
        assigned_support_id=None,
        consent_to_share=True,
        source="web",
    )
    request2.status_history.append(RequestStatusHistory(to_status="submitted", notes="Guest request received", created_at=_dt(0, 5)))
    request2.status_history.append(RequestStatusHistory(to_status="under_review", notes="Awaiting support officer review", created_at=_dt(0, 4)))
    db.add(request2)

    request3 = SearchRequest(
        reference="SR-2026-0003",
        secure_token=secrets.token_urlsafe(24),
        user_id=seeker.id,
        guest_name=seeker.name,
        guest_phone=seeker.phone,
        guest_email=seeker.email,
        category="residential",
        county_id=county.id,
        town_id=kehancha.id,
        neighbourhood_id=locations["neighbourhoods"]["migori-road"].id,
        landmark_id=locations["landmarks"]["Kehancha Bus Stage"].id,
        budget_min=Decimal("25000"),
        budget_max=Decimal("32000"),
        property_type="three_bedroom",
        bedrooms_min=3,
        requirements="Family house with a secure compound and space for a small garden. We would like to move in within six weeks.",
        contact_method="phone",
        status=SearchRequestStatus.COMPLETED.value,
        assigned_support_id=support.id,
        consent_to_share=True,
        completed_at=_dt(12),
        source="web",
    )
    request3.status_history.append(RequestStatusHistory(to_status="submitted", notes="Request received", created_at=_dt(25)))
    request3.status_history.append(RequestStatusHistory(to_status="matching", notes="Matching available homes", created_at=_dt(24)))
    request3.status_history.append(RequestStatusHistory(to_status="matches_available", notes="One home matched and shared", created_at=_dt(22)))
    request3.status_history.append(RequestStatusHistory(to_status="viewing_confirmed", notes="Viewing confirmed with the property representative", created_at=_dt(18)))
    request3.status_history.append(RequestStatusHistory(to_status="completed", notes="Seeker confirmed the viewing and completed the request", created_at=_dt(12)))
    request3.matches.append(
        RequestMatch(
            property_id=props["three-bed-migori-road"].id,
            title=props["three-bed-migori-road"].title,
            description=props["three-bed-migori-road"].description[:500],
            rent_amount=props["three-bed-migori-road"].rental_terms.rent_amount,
            location_text="Migori Road, Kehancha",
            score=Decimal("89.00"),
            explanation=json.dumps({"satisfied": ["Three bedrooms", "Budget", "Secure compound"], "message": "Fit the family brief and was confirmed available."}),
            stage="database",
            status="accepted",
            created_by_id=support.id,
        )
    )
    db.add(request3)

    request4 = SearchRequest(
        reference="SR-2026-0004",
        secure_token=secrets.token_urlsafe(24),
        user_id=None,
        guest_name="Michael Ochieng",
        guest_phone="+254733556677",
        category="residential",
        county_id=county.id,
        town_id=kehancha.id,
        neighbourhood_id=locations["neighbourhoods"]["kehancha-town-centre"].id,
        budget_min=Decimal("8000"),
        budget_max=Decimal("14000"),
        property_type="one_bedroom",
        bedrooms_min=1,
        requirements="One-bedroom unit for a single professional, walking distance to town, with secure parking.",
        contact_method="sms",
        status=SearchRequestStatus.INVESTIGATION_IN_PROGRESS.value,
        assigned_support_id=support.id,
        consent_to_share=True,
        source="phone",
    )
    request4.status_history.append(RequestStatusHistory(to_status="submitted", notes="Request received by phone", created_at=_dt(3)))
    request4.status_history.append(RequestStatusHistory(to_status="partner_assigned", notes="Local partner asked to check availability", created_at=_dt(2)))
    request4.status_history.append(RequestStatusHistory(to_status="investigation_in_progress", notes="Partner accepted the assignment", created_at=_dt(1)))
    db.add(request4)
    db.flush()

    assignment = PartnerAssignment(
        reference="PA-2026-0001",
        request_id=request4.id,
        partner_id=partner_profile.id,
        assigned_by_id=support.id,
        status=AssignmentStatus.IN_PROGRESS.value,
        instructions="Check three authorised contacts near the town centre. Record who you spoke to, the confirmed rent and any vacant date. Do not pay or promise a unit.",
        due_at=_dt(-2),
        accepted_at=_dt(1),
    )
    db.add(assignment)
    db.flush()
    db.add(
        FieldReport(
            assignment_id=assignment.id,
            partner_id=partner_profile.id,
            report_type="investigation",
            summary="Two contacts were reachable. One one-bedroom unit near the town centre is genuinely vacant and the rent was confirmed at KES 13,000 per month. A second unit was occupied.",
            findings=json.dumps(
                {
                    "properties_checked": 3,
                    "reachable_contacts": 2,
                    "confirmed_available": 1,
                    "rent_confirmed": 13000,
                    "notes": "Landlord asked for a viewing before any payment. Exact address withheld until a viewing is booked.",
                }
            ),
            contact_name="Property representative (recorded in assignment)",
            contact_phone="+254711889900",
            property_found=True,
            photos=json.dumps(["seed/evidence/field-report-001.jpg"]),
            status="submitted",
        )
    )
    db.add(
        PartnerAssignment(
            reference="PA-2026-0002",
            request_id=request1.id,
            partner_id=partner_profile.id,
            assigned_by_id=support.id,
            status=AssignmentStatus.COMPLETED.value,
            instructions="Confirm the availability of the Amani apartment before the seeker views it.",
            due_at=_dt(2),
            accepted_at=_dt(4),
            completed_at=_dt(3),
        )
    )
    db.flush()
    return {
        "partner_profile": partner_profile,
        "data_profile": data_profile,
        "request1": request1,
        "request2": request2,
        "request3": request3,
        "request4": request4,
        "assignment": assignment,
    }


def _create_viewings(db: Session, users: dict[str, User], props: dict[str, Property], assisted: dict) -> None:
    seeker = users["seeker"]
    support = users["support"]
    viewing1 = Viewing(
        reference="VW-2026-0001",
        property_id=props["two-bed-amani"].id,
        seeker_id=seeker.id,
        seeker_name=seeker.name,
        seeker_phone=seeker.phone,
        landlord_id=props["two-bed-amani"].created_by_id,
        coordinator_id=support.id,
        requested_by_id=seeker.id,
        preferred_date=_dt(-3),
        scheduled_at=_dt(-2),
        status=ViewingStatus.CONFIRMED.value,
        meeting_point="Meet at the Amani junction near the hospital, then walk to the unit together.",
        notes="Seeker will come with one family member. Please confirm the deposit position at the viewing.",
    )
    viewing1.status_history.append(ViewingStatusHistory(to_status="requested", notes="Viewing requested", actor_id=seeker.id, created_at=_dt(4)))
    viewing1.status_history.append(ViewingStatusHistory(to_status="confirmed", notes="Landlord confirmed the appointment", actor_id=props["two-bed-amani"].created_by_id, created_at=_dt(3)))
    db.add(viewing1)

    viewing2 = Viewing(
        reference="VW-2026-0002",
        property_id=props["one-bed-town-centre"].id,
        seeker_id=seeker.id,
        seeker_name=seeker.name,
        seeker_phone=seeker.phone,
        landlord_id=props["one-bed-town-centre"].created_by_id,
        coordinator_id=support.id,
        requested_by_id=seeker.id,
        preferred_date=_dt(-5),
        status=ViewingStatus.REQUESTED.value,
        meeting_point=None,
        notes="Prefer a weekday evening viewing.",
    )
    viewing2.status_history.append(ViewingStatusHistory(to_status="requested", notes="Viewing requested", actor_id=seeker.id, created_at=_dt(1)))
    db.add(viewing2)

    viewing3 = Viewing(
        reference="VW-2026-0003",
        property_id=props["three-bed-migori-road"].id,
        seeker_id=seeker.id,
        seeker_name=seeker.name,
        seeker_phone=seeker.phone,
        landlord_id=props["three-bed-migori-road"].created_by_id,
        coordinator_id=support.id,
        requested_by_id=seeker.id,
        preferred_date=_dt(19),
        scheduled_at=_dt(18),
        status=ViewingStatus.COMPLETED.value,
        meeting_point="Kehancha Bus Stage, near the kiosk",
        notes="Completed viewing with the landlord's authorised representative.",
        completed_at=_dt(18),
    )
    viewing3.status_history.append(ViewingStatusHistory(to_status="requested", notes="Viewing requested", actor_id=seeker.id, created_at=_dt(22)))
    viewing3.status_history.append(ViewingStatusHistory(to_status="confirmed", notes="Viewing confirmed", actor_id=support.id, created_at=_dt(21)))
    viewing3.status_history.append(ViewingStatusHistory(to_status="completed", notes="Viewing completed", actor_id=support.id, created_at=_dt(18)))
    viewing3.feedback.append(
        ViewingFeedback(
            seeker_id=seeker.id,
            matched_photos=True,
            matched_description=True,
            rent_matched=True,
            property_available=True,
            representative_reachable=True,
            suspected_fraud=False,
            rating=5,
            comments="The house matched the photos. The representative was on time and explained the water and deposit arrangements clearly.",
            status="submitted",
        )
    )
    db.add(viewing3)
    db.flush()


def _create_finance(db: Session, users: dict[str, User], props: dict[str, Property], assisted: dict) -> None:
    ensure_default_plans(db)
    plan_map = {
        plan.code: plan for plan in db.execute(select(SubscriptionPlan)).scalars().all()
    }
    existing_promotions = set(db.execute(select(Promotion.code)).scalars().all())
    for code, name, description, price, days in [
        ("featured-14", "Featured listing · 14 days", "Show the listing in featured placements for 14 days.", 200, 14),
        ("featured-30", "Featured listing · 30 days", "Show the listing in featured placements for 30 days.", 350, 30),
        ("urgent-7", "Urgent availability · 7 days", "Highlight recently confirmed availability for seven days.", 150, 7),
    ]:
        if code in existing_promotions:
            continue
        db.add(
            Promotion(
                code=code,
                name=name,
                description=description,
                kind="featured",
                price=Decimal(str(price)),
                currency="KES",
                duration_days=days,
                is_active=True,
                terms="Promotions do not affect moderation or verification outcomes.",
            )
        )

    # Demo accounts that already hold a portfolio larger than the free limit keep
    # working out of the box. These are clearly labelled demo subscriptions and
    # payments, not evidence of a real charge.
    now = datetime.now(UTC)
    for user_key, plan_code in (
        ("landlord", "partner_pro"),
        ("landlord2", "partner_pro"),
        ("manager", "partner_pro"),
    ):
        user = users.get(user_key)
        plan = plan_map.get(plan_code)
        if user is None or plan is None:
            continue
        existing_subscription = db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        ).scalars().first()
        if existing_subscription is not None:
            continue
        payment = Payment(
            reference=f"PAY-SEED-{user_key.upper()}",
            user_id=user.id,
            purpose="subscription",
            related_type="subscription_plan",
            related_id=plan.id,
            amount=plan.price,
            currency=plan.currency,
            status=PaymentStatus.SUCCESS.value,
            provider="mpesa",
            provider_reference=f"MOCK-SEED-{user_key.upper()}",
            phone=user.phone,
            idempotency_key=f"seed-subscription-{user_key}",
            description=f"Demo subscription · {plan.name}",
            completed_at=now,
        )
        db.add(payment)
        db.flush()
        subscription = Subscription(
            user_id=user.id,
            plan_id=plan.id,
            status="active",
            starts_at=now - timedelta(days=10),
            ends_at=now + timedelta(days=PLAN_PERIOD_DAYS.get(plan.period, 30) - 10),
            payment_id=payment.id,
        )
        db.add(subscription)
        db.add(
            Invoice(
                number=f"INV-SEED-{user_key.upper()}",
                payment_id=payment.id,
                user_id=user.id,
                amount=plan.price,
                currency=plan.currency,
                status="paid",
                line_items=json.dumps(
                    [{"description": payment.description, "amount": str(plan.price)}]
                ),
                paid_at=now,
            )
        )
    db.flush()

    request1 = assisted["request1"]
    landlord = users["landlord"]
    payment1 = Payment(
        reference="PAY-DEMO-0001",
        user_id=landlord.id,
        purpose="featured_listing",
        related_type="property",
        related_id=props["bedsitter-kariobangi"].id,
        amount=Decimal("200.00"),
        currency="KES",
        status=PaymentStatus.SUCCESS.value,
        provider="mpesa",
        provider_reference="MOCK-QKJ7A1B2C3",
        phone=landlord.phone,
        idempotency_key="seed-featured-bedsitter-kariobangi",
        description="Featured listing · FND-1001",
        completed_at=_dt(3),
        reconciled=True,
    )
    db.add(payment1)
    db.flush()
    db.add(
        Invoice(
            number="INV-DEMO-0001",
            payment_id=payment1.id,
            user_id=landlord.id,
            amount=Decimal("200.00"),
            currency="KES",
            status="paid",
            line_items=json.dumps([{"label": "Featured listing · 14 days", "amount": 200}]),
            issued_at=_dt(3),
            paid_at=_dt(3),
        )
    )
    payment2 = Payment(
        reference="PAY-DEMO-0002",
        user_id=assisted["request1"].user_id,
        purpose="assisted_search",
        related_type="search_request",
        related_id=request1.id,
        amount=Decimal("300.00"),
        currency="KES",
        status=PaymentStatus.SUCCESS.value,
        provider="mpesa",
        provider_reference="MOCK-RT8K4M2N9P",
        phone=users["seeker"].phone,
        idempotency_key="seed-assisted-request-0001",
        description="Assisted property search service · SR-2026-0001",
        completed_at=_dt(3),
        reconciled=True,
    )
    db.add(payment2)
    db.flush()
    db.add(
        Invoice(
            number="INV-DEMO-0002",
            payment_id=payment2.id,
            user_id=payment2.user_id,
            amount=Decimal("300.00"),
            currency="KES",
            status="paid",
            line_items=json.dumps([{"label": "Assisted property search", "amount": 300}]),
            issued_at=_dt(3),
            paid_at=_dt(3),
        )
    )
    payment3 = Payment(
        reference="PAY-DEMO-0003",
        user_id=users["landlord2"].id,
        purpose="featured_listing",
        related_type="property",
        related_id=props["warehouse-kisii-road"].id,
        amount=Decimal("200.00"),
        currency="KES",
        status=PaymentStatus.REFUNDED.value,
        provider="mpesa",
        provider_reference="MOCK-LM2P8Q4R6S",
        phone=users["landlord2"].phone,
        idempotency_key="seed-featured-warehouse-refunded",
        description="Featured listing · FND-1015 (refunded after duplicate promotion)",
        completed_at=_dt(9),
        reconciled=True,
    )
    db.add(payment3)
    db.flush()
    db.add(
        Refund(
            payment_id=payment3.id,
            amount=Decimal("200.00"),
            currency="KES",
            reason="Duplicate promotion purchase; refunded in full during the pilot.",
            status="completed",
            processed_by_id=users["finance"].id,
            provider_reference="MOCK-REFUND-0003",
            completed_at=_dt(8),
        )
    )
    db.add(
        Payment(
            reference="PAY-DEMO-0004",
            user_id=users["seeker"].id,
            purpose="assisted_search",
            related_type="search_request",
            related_id=assisted["request3"].id,
            amount=Decimal("300.00"),
            currency="KES",
            status=PaymentStatus.SUCCESS.value,
            provider="mpesa",
            provider_reference="MOCK-AB5C7D9E1F",
            phone=users["seeker"].phone,
            idempotency_key="seed-assisted-request-0003",
            description="Assisted property search service · SR-2026-0003",
            completed_at=_dt(24),
            reconciled=True,
        )
    )
    db.flush()


def _create_communications(db: Session, users: dict[str, User], props: dict[str, Property], assisted: dict) -> None:
    notifications = [
        (users["seeker"], "assisted_matches", "Two possible homes for your search", "We found two approved homes that match your assisted search. Review them and tell us which one you would like to view.", {"request_id": str(assisted["request1"].id)}),
        (users["seeker"], "viewing_confirmed", "Viewing confirmed", "Your viewing for the Amani apartment is confirmed. Meet at the Amani junction near the hospital.", {"property_id": str(props["two-bed-amani"].id)}),
        (users["landlord"], "property_approved", "Listing approved", "Your bedsitter listing has been approved and is now visible to seekers.", {"property_id": str(props["bedsitter-kariobangi"].id)}),
        (users["landlord"], "availability_reminder", "Confirm availability for your listings", "Two of your listings are due for an availability reconfirmation. Fresh information helps seekers trust your listing.", {}),
        (users["partner"], "assignment_offered", "New local investigation assignment", "A new assisted search assignment is available in Kehancha town centre.", {"assignment_id": str(assisted["assignment"].id)}),
        (users["support"], "field_report_submitted", "Field report submitted", "David Otieno submitted a field report for PA-2026-0001. Review the findings before sharing with the seeker.", {"assignment_id": str(assisted["assignment"].id)}),
    ]
    for user, ntype, title, body, data in notifications:
        db.add(
            Notification(
                user_id=user.id,
                notification_type=ntype,
                title=title,
                body=body,
                data=json.dumps(data, default=str),
                channels="in_app",
                read_at=_dt(0, 2) if user.email == "seeker@findora.co.ke" and ntype == "assisted_matches" else None,
            )
        )
    db.add(
        SupportTicket(
            reference="TKT-DEMO-0001",
            user_id=users["landlord"].id,
            subject="How do I correct a water charge on my listing?",
            description="A tenant says the listing says water is included, but I bill water separately. How do I correct the listing without losing the verification badge?",
            category="listing_help",
            status="resolved",
            priority="normal",
            assigned_to_id=users["support"].id,
            resolution="Support explained how to update the additional charges field. The material change requires moderation before republication.",
            resolved_at=_dt(6),
        )
    )
    db.add(
        Complaint(
            reference="CMP-DEMO-0001",
            complainant_id=users["seeker"].id,
            complainant_name=users["seeker"].name,
            complainant_phone=users["seeker"].phone,
            property_id=props["unconfirmed-shop"].id,
            category="misleading_information",
            description="The owner's phone number was not reachable after two attempts, and the listing still says availability is unconfirmed.",
            status="reviewing",
            priority="normal",
            assigned_to_id=users["support"].id,
        )
    )
    db.add(
        PropertyReport(
            property_id=props["shop-market-road"].id,
            reporter_id=users["seeker"].id,
            reporter_phone=users["seeker"].phone,
            reason="incorrect_information",
            details="The listing says the shop has three-phase power, but the caretaker said it is single-phase. Please confirm before someone pays.",
            status="reviewing",
            reviewed_by_id=users["moderator"].id,
        )
    )
    db.add(
        PropertyReport(
            property_id=props["single-room-sokoni"].id,
            reporter_id=None,
            reporter_phone="+254799887766",
            reason="misleading_photos",
            details="The photo shows a larger room than the one I saw. The listing should explain that the unit shares bathroom facilities.",
            status="resolved",
            resolution="Moderator added the shared-facilities note to the listing and asked the owner to upload accurate photos.",
            reviewed_by_id=users["moderator"].id,
            resolved_at=_dt(7),
        )
    )
    audit_specs = [
        (users["moderator"], "property.approved", "property", props["bedsitter-kariobangi"].id, {"status": "approved"}),
        (users["moderator"], "property.rejected", "property", props["rejected-bedsitter"].id, {"status": "rejected"}),
        (users["verifier"], "verification.approved", "verification_record", props["two-bed-amani"].id, {"type": "ownership"}),
        (users["support"], "assisted.request.reviewed", "search_request", assisted["request1"].id, {"status": "matches_available"}),
        (users["finance"], "refund.completed", "payment", None, {"amount": 200, "provider": "mpesa"}),
    ]
    for actor, action, resource_type, resource_id, after in audit_specs:
        db.add(
            AuditLog(
                actor_id=actor.id,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else None,
                after=json.dumps(after),
                created_at=_dt(2),
            )
        )
    db.flush()


def seed(db: Session) -> None:
    bootstrap(db)
    db.flush()
    locations = _create_locations(db)
    users = _create_users(db)
    _create_reference_data(db)
    db.flush()
    amenity_map = {a.slug: a for a in db.execute(select(Amenity)).scalars().all()}
    use_map = {c.slug: c for c in db.execute(select(CommercialUse)).scalars().all()}
    props: dict[str, Property] = {}
    for data in PROPERTIES:
        props[data["key"]] = _create_property(db, data, users, locations, amenity_map, use_map)
    db.flush()
    _create_seeker_data(db, users, props)
    assisted = _create_assisted(db, users, props, locations)
    _create_viewings(db, users, props, assisted)
    _create_finance(db, users, props, assisted)
    _create_communications(db, users, props, assisted)
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo data for Findora Spaces")
    parser.add_argument("--if-empty", action="store_true", help="Skip if any users already exist")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate all tables first (destructive)")
    args = parser.parse_args()

    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    if args.reset:
        if settings.is_production:
            raise SystemExit("Refusing to reset a production database.")
        Base.metadata.drop_all(bind=engine)
        init_db()
    else:
        init_db()

    with SessionLocal() as db:
        if args.if_empty:
            existing = db.execute(select(User.id).limit(1)).first()
            if existing:
                print("Seed skipped: users already exist.")
                return
        seed(db)
        property_count = db.execute(select(Property)).scalars().all()
        user_count = db.execute(select(User)).scalars().all()
        print(f"Seeded {len(user_count)} users and {len(property_count)} demo properties.")
        print("Demo accounts (password):")
        for email, password in DEMO_PASSWORD.items():
            print(f"  {email} / {password}")
        print("Public listing coverage: Kehancha, Migori County. All seeded listings are fictional demo data.")


if __name__ == "__main__":
    main()
