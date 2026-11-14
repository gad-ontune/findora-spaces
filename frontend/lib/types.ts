export type Category = "residential" | "commercial";

export type Media = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  mime_type: string | null;
};

export type Amenity = {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
  details?: string | null;
};

export type CommercialUse = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

export type VerificationCheck = {
  type: string;
  label: string;
  status: string;
  verified_at: string | null;
  expires_at: string | null;
  summary: string | null;
  evidence_count?: number;
};

export type MoveInCost = {
  currency: string;
  rent_period: string;
  line_items: { label: string; amount: number; kind?: string }[];
  recurring_total: number;
  one_time_total: number;
  initial_total: number;
  disclosed: boolean;
  utilities_included: boolean;
  note: string;
};

export type PropertyLocation = {
  town_id: string;
  town: string;
  town_slug: string;
  county: string;
  county_slug: string;
  sub_county: string | null;
  neighbourhood_id: string | null;
  neighbourhood: string | null;
  neighbourhood_slug: string | null;
  locality: string | null;
  landmark_id: string | null;
  landmark: string | null;
  address_line: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: string;
  distance_to_landmark_km: number | null;
  map_note: string | null;
};

export type PropertySummary = {
  id: string;
  reference: string;
  title: string;
  category: Category;
  property_type: string;
  status: string;
  availability_status: string;
  stored_availability_status: string;
  is_fresh: boolean;
  last_confirmed_available_at: string | null;
  freshness_days: number;
  is_featured: boolean;
  rent_amount: number | null;
  deposit_amount: number | null;
  currency: string;
  rent_period: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  floor_area_sqm: number | null;
  frontage_m: number | null;
  location: PropertyLocation;
  primary_image: Media | null;
  media_count: number;
  amenities: Amenity[];
  commercial_uses: CommercialUse[];
  verification: {
    level: string;
    verified_count: number;
    pending_count?: number;
    total_checks?: number;
    verified_types?: string[];
    summary?: string;
    disclaimer?: string;
    checks: VerificationCheck[];
  };
  move_in_cost: MoveInCost;
  created_at: string;
  published_at: string | null;
  views_count: number;
  favourite_id?: string;
  saved_at?: string;
  owner_id?: string | null;
  created_by_id?: string | null;
  manager_id?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
  recorded_owner_name?: string | null;
  recorded_owner_phone?: string | null;
};

export type PropertyDetail = PropertySummary & {
  description: string;
  terms: {
    currency: string;
    rent_amount: number;
    deposit_amount: number;
    rent_period: string;
    agency_fee: number | null;
    service_fee: number | null;
    utility_connection_fee: number | null;
    other_mandatory_fee: number | null;
    other_charges: { label: string; amount: number }[];
    utilities_included: boolean;
    negotiable: boolean;
    available_from: string | null;
    minimum_lease_months: number | null;
    payment_schedule: string | null;
  };
  residential: {
    bedrooms: number | null;
    bathrooms: number | null;
    house_style: string | null;
    furnishing: string | null;
    floor_number: string | null;
    has_private_bathroom: boolean | null;
    parking_spaces: number | null;
    outdoor_space: string | null;
    security_features: string[];
    water_source: string | null;
    electricity_supply: string | null;
    shared_accommodation: boolean;
  } | null;
  commercial: {
    floor_area_sqm: number | null;
    frontage_m: number | null;
    floor_level: string | null;
    power_capacity_kva: number | null;
    parking_spaces: number | null;
    accessibility: string | null;
    loading_access: boolean | null;
    visibility: string | null;
    road_access: string | null;
    lease_duration_months: number | null;
    zoning_note: string | null;
    permitted_use_verified: boolean | null;
    ceiling_height_m?: number | null;
    water_supply?: string | null;
    sanitation?: string | null;
  } | null;
  media: Media[];
  contact: {
    name: string;
    role: string;
    phone_masked: string;
    phone_verified: boolean;
    member_since: string;
    manager_name: string | null;
    contact_note: string;
  };
  history: { type: string; summary: string; created_at: string }[];
  availability_history: { status: string; confirmed_at: string; source: string }[];
  inspections: {
    id: string;
    inspection_date: string;
    exterior_condition: string | null;
    interior_condition: string | null;
    water_facilities: string | null;
    electricity: string | null;
    doors_windows: string | null;
    plumbing: string | null;
    access: string | null;
  }[];
  inspection_note: string;
  report_count: number;
  last_updated_at: string;
  detail_confidence: string;
  management?: {
    owner_id: string | null;
    created_by_id: string | null;
    manager_id: string | null;
    status: string;
    rejection_reason: string | null;
    suspension_reason: string | null;
    recorded_owner_name: string | null;
    recorded_owner_phone: string | null;
    is_fresh: boolean;
    availability_stored: string;
  };
};

export type Pagination = {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type PropertySearchResponse = {
  items: PropertySummary[];
  pagination: Pagination;
  facets: {
    property_types: { value: string; count: number }[];
    rent_min: number | null;
    rent_max: number | null;
    amenities?: { value: string; label: string; count: number }[];
  };
  empty_state: {
    message: string;
    suggestions: string[];
    fabricated_results: boolean;
  } | null;
  visibility_note: string;
};

export type HomePayload = {
  hero: {
    headline: string;
    subheadline: string;
    total_available: number;
    towns_covered: number;
    landlords: number;
    primary_action: { label: string; href: string };
    secondary_action: { label: string; href: string };
  };
  featured: PropertySummary[];
  recently_added: PropertySummary[];
  recently_confirmed: PropertySummary[];
  popular_locations: {
    id: string;
    name: string;
    slug: string;
    county: string;
    property_count: number;
    latitude: number | null;
    longitude: number | null;
  }[];
  neighbourhoods: {
    id: string;
    name: string;
    slug: string;
    town: string;
    description: string | null;
    property_count: number;
  }[];
  residential_types: TypeOption[];
  commercial_types: TypeOption[];
  assisted_steps: { step: number; title: string; description: string }[];
  safety: { guidance: string[]; verification_note: string };
  landlord_cta: { title: string; description: string; href: string };
  market_snapshot: unknown[];
  principles: { title: string; description: string }[];
};

export type TypeOption = {
  value: string;
  label: string;
  description?: string | null;
  count?: number;
};

export type ConfigPayload = {
  brand: {
    name: string;
    promise: string;
    launch_market: string;
    currency: string;
  };
  property_types: Record<Category, TypeOption[]>;
  amenities: (Amenity & { applies_to: string })[];
  commercial_uses: CommercialUse[];
  counties: { id: string; name: string; code: string; slug: string }[];
  towns: {
    id: string;
    name: string;
    slug: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  filters: {
    sort_options: TypeOption[];
    verification_filters: TypeOption[];
    freshness_days: number;
  };
  map: { style_url: string; attribution: string };
  safety: string[];
  assisted_steps: { step: number; title: string; description: string }[];
};

export type UserProfile = {
  bio: string | null;
  preferred_contact: string;
  whatsapp: string | null;
  locale: string;
  town_id: string | null;
  marketing_consent: boolean;
};

export type User = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  phone_verified: boolean;
  phone_verified_at: string | null;
  avatar_url: string | null;
  created_at: string;
  profile: UserProfile | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channels: string[];
  read: boolean;
  read_at: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  reference: string;
  purpose: string;
  related_type: string | null;
  related_id: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_reference: string | null;
  phone: string | null;
  description: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  user_id?: string | null;
};

export type Invoice = {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  line_items: { label: string; amount: number }[];
  issued_at: string;
  paid_at: string | null;
};

export type SavedSearch = {
  id: string;
  name: string;
  category: Category;
  filters: Record<string, unknown>;
  notify: boolean;
  created_at: string;
};

export type Shortlist = {
  id: string;
  token: string;
  name: string;
  description: string | null;
  created_at: string;
  properties: PropertySummary[];
  comments: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[];
};

export type Comparison = {
  id: string;
  name: string;
  created_at: string;
  properties: PropertySummary[];
  trade_offs: { title: string; description: string }[] | Record<string, unknown>[];
};

export type Viewing = {
  id: string;
  reference: string;
  status: string;
  property: PropertySummary | null;
  seeker_name: string;
  seeker_phone: string;
  preferred_date: string | null;
  scheduled_at: string | null;
  meeting_point: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  completed_at: string | null;
  feedback: {
    matched_photos: boolean | null;
    matched_description: boolean | null;
    rent_matched: boolean | null;
    property_available: boolean | null;
    representative_reachable: boolean | null;
    suspected_fraud: boolean;
    rating: number | null;
    comments: string | null;
    created_at: string;
  }[];
  status_history: {
    from: string | null;
    to: string;
    notes: string | null;
    created_at: string;
  }[];
};

export type SearchRequest = {
  id: string;
  reference: string;
  status: string;
  category: Category;
  town: string | null;
  town_id: string | null;
  neighbourhood: string | null;
  landmark: string | null;
  budget_min: number | null;
  budget_max: number;
  property_type: string | null;
  bedrooms_min: number | null;
  floor_area_min: number | null;
  floor_area_max: number | null;
  frontage_min: number | null;
  loading_required: boolean;
  parking_required: boolean;
  facilities: string[];
  move_in_date: string | null;
  business_type: string | null;
  requirements: string;
  assistance_requirements: string | null;
  contact_method: string;
  priority: string;
  assigned_support: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancellation_reason: string | null;
  match_count: number;
  assignment_count: number;
  status_history: {
    from: string | null;
    to: string;
    notes: string | null;
    created_at: string;
  }[];
  messages: {
    id: string;
    sender_name: string;
    body: string;
    is_internal: boolean;
    created_at: string;
  }[];
};

export type RequestMatch = {
  id: string;
  source: string;
  status: string;
  score: number | null;
  title: string;
  description: string | null;
  rent_amount: number | null;
  location_text: string | null;
  explanation: {
    positives?: string[];
    negatives?: string[];
    unmet_requirements?: string[];
  };
  property: PropertySummary | null;
  created_at: string;
};

export type Enquiry = {
  id: string;
  property_id: string;
  property: PropertySummary | null;
  seeker_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  type: string;
  status: string;
  response: string | null;
  created_at: string;
  responded_at: string | null;
};

export type PartnerProfile = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  company_name: string | null;
  partner_type: string;
  status: string;
  rating: number | null;
  response_rate: number | null;
  completed_assignments: number;
  accuracy_score: number | null;
  service_areas: { town_id: string; neighbourhood_id: string | null; primary: boolean }[];
  created_at: string;
};

export type PartnerAssignment = {
  id: string;
  reference: string;
  status: string;
  partner_id: string;
  partner_name: string | null;
  instructions: string | null;
  due_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  declined_reason: string | null;
  created_at: string;
  request: {
    id: string;
    reference: string;
    category: Category;
    status: string;
    town: string | null;
    neighbourhood: string | null;
    budget_min: number | null;
    budget_max: number | null;
    property_type: string | null;
    requirements: string;
    contact_method: string;
    guest_phone: string | null;
    guest_name: string | null;
  };
  reports: {
    id: string;
    report_type: string;
    summary: string;
    findings: Record<string, unknown>;
    contact_name: string | null;
    contact_phone: string | null;
    property_found: boolean;
    photos: string[];
    status: string;
    submitted_at: string;
    review_notes: string | null;
    reviewed_at: string | null;
  }[];
};

export type AdminDashboard = {
  properties: {
    total: number;
    by_status: Record<string, number>;
    by_availability: Record<string, number>;
    pending_moderation: number;
    pending_verification_properties: number;
  };
  users: { total: number; active: number; verified_phones: number };
  reports: { open: number; complaints_open: number; support_tickets_open: number };
  assisted: {
    open_requests: number;
    pending_assignments: number;
    field_reports_to_review: number;
  };
  viewings: { upcoming: number };
  finance: {
    revenue_today: number;
    revenue_this_month: number;
    successful_payments_month: number;
  };
  recent_audit: {
    action: string;
    resource_type: string;
    resource_id: string;
    actor_id: string | null;
    created_at: string;
  }[];
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export type VerificationQueueItem = {
  id: string;
  property_id: string | null;
  property_reference: string | null;
  property_title: string | null;
  type: string;
  status: string;
  notes: string | null;
  evidence_reference?: string | null;
  requested_by_id: string | null;
  created_at: string;
  evidence?: { id: string; kind: string; description: string | null }[];
};

export type AdminUser = User & {
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
};

export type AdminPartner = PartnerProfile & {
  assignments: number;
};

export type PropertyReport = {
  id: string;
  property_id: string;
  property_reference: string;
  property_title: string;
  reason: string;
  details: string;
  status: string;
  resolution: string | null;
  reporter_phone: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type Complaint = {
  id: string;
  reference: string;
  category: string;
  description: string;
  status: string;
  priority: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
  complainant_name: string | null;
  property_id: string | null;
  search_request_id: string | null;
};

export type SupportTicket = {
  id: string;
  reference: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  resolution: string | null;
  created_at: string;
};

export type SystemSetting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
};

export type SeekerOverview = {
  saved_properties: number;
  enquiries: number;
  assisted_requests: number;
  active_requests: number;
  viewings: number;
  upcoming_viewings: number;
  unread_notifications: number;
  profile_complete: boolean;
};

export type NotificationPreferences = {
  in_app: boolean;
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
  marketing: boolean;
  note: string;
};

export type UserSession = {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
  active: boolean;
};

export type ComparisonItem = {
  id: string;
  reference: string;
  title: string;
  property_type: string;
  category: Category;
  rent: number | null;
  deposit: number | null;
  move_in_total: number;
  bedrooms: number | null;
  bathrooms: number | null;
  floor_area_sqm: number | null;
  rent_period: string;
  furnishing: string | null;
  amenities: string[];
  verification_level: string;
  verified_count: number;
  last_confirmed_available_at: string | null;
  is_fresh: boolean;
  neighbourhood: string | null;
  town: string | null;
  landmark: string | null;
  distance_to_landmark_km: number | null;
  primary_image: Media | null;
  commercial_uses: string[];
};

export type ComparisonRecord = {
  id: string;
  name: string;
  created_at: string;
  properties: ComparisonItem[];
  trade_offs: string[];
};

export type OptionsPayload = {
  counties: { id: string; name: string; slug: string; code?: string }[];
  towns: {
    id: string;
    name: string;
    slug: string;
    county: string | null;
    county_id: string | null;
    sub_county?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }[];
  neighbourhoods?: { id: string; name: string; slug: string; town_id: string; town?: string }[];
  landmarks?: { id: string; name: string; slug?: string; town_id?: string }[];
};

export type PropertyListResponse = {
  properties: PropertySummary[];
  overview: {
    total: number;
    active: number;
    pending: number;
    available: number;
    unconfirmed: number;
    views: number;
    contact_requests: number;
  };
};

export type PartnerFieldReport = {
  id: string;
  report_type: string;
  summary: string;
  findings: Record<string, unknown>;
  contact_name: string | null;
  contact_phone: string | null;
  property_found: boolean;
  photos: string[];
  status: string;
  submitted_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
};

export type PartnerAssignmentReport = PartnerFieldReport;

export type PartnerApplication = {
  partner: PartnerProfile | null;
  service_areas?: { town_id: string; town?: string; is_primary: boolean }[];
};

export type VerificationRecord = {
  id: string;
  type: string;
  status: string;
  evidence_reference: string | null;
  notes: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
  evidence: { id: string; kind: string; description: string | null }[];
};

export type PropertyVerification = {
  checks: VerificationCheck[];
  records: VerificationRecord[];
};

export type AvailabilityHistoryItem = {
  status: string;
  confirmed_at: string | null;
  source: string;
  notes: string | null;
  next_recheck_at: string | null;
  created_at: string;
};

export type SimplePagination = {
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type AdminPropertyListResponse = {
  properties: PropertySummary[];
  pagination: SimplePagination;
};

export type AdminUserListResponse = {
  users: AdminUser[];
  pagination: SimplePagination;
};

export type AdminSearchRequestListResponse = {
  requests: SearchRequest[];
  pagination: SimplePagination;
};

export type AdminPaymentTotals = Record<string, { count: number; amount: number }>;

export type AdminPaymentListResponse = {
  payments: (Payment & { user_id: string | null })[];
  totals: AdminPaymentTotals;
  count: number;
};

export type AdminRefund = {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  provider_reference: string | null;
  created_at: string;
};

export type AdminRefundListResponse = {
  refunds: AdminRefund[];
};

export type AdminReconciliation = {
  id: string;
  date: string;
  provider_total: number;
  internal_total: number;
  difference: number;
  status: string;
};

export type AdminFieldReport = PartnerFieldReport & {
  assignment_id: string;
  assignment_reference: string | null;
  request_id: string | null;
  request_reference: string | null;
  partner_name: string | null;
};

export type AdminFieldReportListResponse = {
  reports: AdminFieldReport[];
  count: number;
};

export type AdminAnalytics = {
  discovery: {
    total_property_views: number;
    contact_requests: number;
    favourites: number;
    comparisons: number;
    contact_rate_percent: number | null;
  };
  supply: {
    by_status: Record<string, number>;
    approved_by_category: Record<string, number>;
    by_availability: Record<string, number>;
    fresh_and_available: number;
  };
  landlords: {
    active_landlords: number;
    enquiries_received: number;
    enquiry_response_rate_percent: number | null;
    total_properties: number;
  };
  assisted: {
    by_status: Record<string, number>;
    requests_total: number;
    average_hours_to_first_match: number | null;
    completed: number;
  };
  viewings: {
    by_status: Record<string, number>;
    total: number;
    feedback_submitted: number;
    negative_outcomes: number;
  };
  finance: {
    payments: Record<string, { count: number; amount: number }>;
    refunded_total: number;
  };
  note: string;
};

export type ModerationQueueItem = PropertySummary & {
  duplicate_candidates: {
    property_id: string;
    reference: string;
    title: string;
    score: number;
    reasons: string[];
  }[];
};

export type ModerationQueueResponse = {
  queue: ModerationQueueItem[];
  count: number;
};

export type AdminViewingListResponse = {
  viewings: Viewing[];
  count: number;
};

export type MatchSuggestion = {
  property: PropertySummary;
  score: number;
  explanation: {
    positives: string[];
    negatives: string[];
    unmet_requirements: string[];
    score_breakdown?: Record<string, number>;
  };
  is_alternative: boolean;
};

export type AdminMatchesResponse = {
  suggestions: MatchSuggestion[];
  persisted: RequestMatch[];
  strict_count: number;
  alternative_count: number;
  restrictions: string[];
  message: string;
  weights: Record<string, unknown>;
};

export type AdminSearchRequestDetail = SearchRequest & {
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  consent_to_share: boolean;
  assignments: PartnerAssignment[];
};

export type AdminPartnerListResponse = {
  partners: AdminPartner[];
};
