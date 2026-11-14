import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatKes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Rent on request";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-KE").format(value ?? 0);
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "Not confirmed";
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "Not confirmed";
  const seconds = Math.max(0, Math.floor((Date.now() - date) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function daysAgo(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.floor((Date.now() - date) / 86_400_000));
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  bedsitter: "Bedsitter",
  single_room: "Single room",
  one_bedroom: "One-bedroom",
  two_bedroom: "Two-bedroom",
  three_bedroom: "Three-bedroom",
  four_bedroom: "Four-bedroom",
  maisonette: "Maisonette",
  bungalow: "Bungalow",
  apartment: "Apartment",
  townhouse: "Townhouse",
  villa: "Villa",
  hostel: "Hostel",
  shop: "Shop",
  office: "Office",
  salon_barbershop: "Salon or barbershop",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  godown: "Godown",
  workshop: "Workshop",
  clinic: "Clinic",
  school: "School",
  hotel: "Hotel",
  filling_station: "Filling station",
  plot: "Plot",
};

export function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function propertyTypeLabel(value: string | null | undefined): string {
  if (!value) return "Property";
  return PROPERTY_TYPE_LABELS[value] ?? titleize(value);
}

export function availabilityLabel(value: string | null | undefined, isFresh?: boolean): string {
  if (value === "available" && isFresh) return "Available now";
  if (value === "available" && !isFresh) return "Needs reconfirmation";
  if (value === "occupied") return "Occupied";
  if (value === "temporarily_unavailable") return "Temporarily unavailable";
  if (value === "unconfirmed") return "Availability unconfirmed";
  return titleize(value);
}

export function statusTone(status: string): "green" | "amber" | "red" | "slate" | "teal" {
  switch (status) {
    case "available":
    case "approved":
    case "active":
    case "completed":
    case "verified":
    case "success":
    case "responded":
    case "confirmed":
      return "green";
    case "pending":
    case "requested":
    case "under_review":
    case "matching":
    case "submitted":
    case "received":
    case "in_progress":
    case "proposed":
    case "unconfirmed":
    case "awaiting_local_investigation":
      return "amber";
    case "rejected":
    case "suspended":
    case "failed":
    case "occupied":
    case "cancelled":
    case "missed":
    case "expired":
      return "red";
    case "matches_available":
    case "partner_assigned":
    case "accepted":
    case "sent":
      return "teal";
    default:
      return "slate";
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return "FS";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.includes("*")) return phone;
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 7)} *** ${phone.slice(-3)}`;
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export function truncate(value: string, length = 140): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trimEnd()}…`;
}

export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return url;
}
