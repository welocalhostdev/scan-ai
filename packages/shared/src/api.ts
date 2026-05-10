/**
 * ScanAI — API client.
 * Typed fetch wrappers for auth, scans, and admin endpoints.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────────

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  plan: string;
  monthly_scan_limit: number;
  active_scan_limit: number;
  schedule_limit: number;
  auth_provider: string;
  email_verified: boolean;
  timezone: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: UserResponse;
  message: string;
}

export interface MessageResponse {
  message: string;
}

export interface ScanCreateResponse {
  scan_id: string;
}

export interface ScheduledScan {
  id: string;
  url: string;
  cron: string;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  last_scan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledScanPayload {
  url: string;
  cron: string;
  timezone?: string;
  is_active?: boolean;
}

export interface ScanCancelResponse {
  scan_id: string;
  status: string;
  message: string;
}

export interface AccountUsage {
  plan: string;
  monthly_scan_limit: number;
  monthly_scans_used: number;
  monthly_scans_remaining: number;
  active_scan_limit: number;
  active_scans: number;
  schedule_limit: number;
  schedules_used: number;
  requires_target_verification: boolean;
}

export interface ScanTarget {
  id: string;
  domain: string;
  status: "pending" | "verified" | "revoked";
  verification_record_name: string;
  verification_record_value: string;
  verified_at: string | null;
  created_at: string;
}

export interface ScanTargetVerifyResponse {
  id: string;
  domain: string;
  status: string;
  message: string;
}

export interface Finding {
  id: string;
  title: string;
  category?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  evidence?: string;
  what_it_means: string;
  how_to_fix: string[];
  fix_prompt?: string;
  affected: string;
}

export interface ScanReport {
  summary: string;
  risk_score: number;
  priority_actions?: string[];
  findings: Finding[];
  _visuals?: {
    attack_surface?: {
      subdomains?: number;
      dns_records?: number;
      live_hosts?: number;
      open_ports?: number;
      crawled_endpoints?: number;
      api_routes?: number;
      parameterized_endpoints?: number;
      api_schemas?: number;
      scanner_findings?: number;
      api_signals?: number;
      tls_signals?: number;
      tls_inventory?: number;
      xss_signals?: number;
      same_origin_links?: number;
      external_hosts?: number;
      technology_fingerprints?: number;
    };
    api_surface?: {
      candidate_routes?: Array<{ path: string; url: string }>;
      documentation_endpoints?: Array<{ path: string; url: string }>;
      parameterized_routes?: Array<{ url: string; parameters: string[]; parameter_count: number }>;
      schemas?: Array<{
        url: string;
        title: string;
        version?: string | null;
        schema_version?: string | null;
        path_count: number;
        operation_count: number;
        methods: string[];
        auth_schemes: string[];
        sample_operations: Array<{
          method: string;
          path: string;
          operation_id?: string | null;
          summary?: string | null;
          parameters?: string[];
          has_request_body?: boolean;
          requires_security?: boolean;
        }>;
      }>;
      candidate_route_count?: number;
      documentation_endpoint_count?: number;
      parameterized_route_count?: number;
      schema_count?: number;
    };
    web_intelligence?: {
      final_url?: string;
      status?: number;
      response_time_ms?: number;
      security_header_score?: number;
      missing_security_headers?: Array<{ header: string; purpose: string }>;
      hsts?: {
        enabled?: boolean;
        max_age?: number;
        include_subdomains?: boolean;
        preload?: boolean;
      };
      cookie_summary?: {
        count?: number;
        missing_secure?: string[];
        missing_http_only?: string[];
      };
      server_fingerprints?: Record<string, string>;
      dnssec?: {
        enabled?: boolean;
        ds_records?: string[];
        dnskey_records?: string[];
      };
      mail_security?: {
        has_mx?: boolean;
        has_spf?: boolean;
        has_dmarc?: boolean;
        dmarc_policy?: string | null;
        mx_records?: string[];
        spf_records?: string[];
        dmarc_records?: string[];
      };
      robots?: {
        available?: boolean;
        disallow_count?: number;
        sample_disallows?: string[];
        sitemaps?: string[];
      };
      sitemap?: {
        available?: boolean;
        url_count?: number;
        sample_urls?: string[];
      };
      security_txt?: {
        available?: boolean;
        contact_count?: number;
        fields?: Record<string, string[]>;
      };
      port_profile?: {
        open_port_count?: number;
        exposed_services?: Array<{ host: string; port: number; service: string }>;
        non_web_services?: Array<{ host: string; port: number; service: string }>;
      };
      waf_detection?: {
        detected?: boolean;
        skipped?: boolean;
        reason?: string;
        name?: string | null;
        manufacturer?: string | null;
        requests?: number | null;
      };
      technology_fingerprints?: Array<{
        name: string;
        version?: string | null;
        categories?: string[];
        confidence?: number | null;
        website?: string | null;
      }>;
    };
    assurance?: {
      mode?: string;
      coverage_notes?: string[];
    };
  };
}

export type SubTaskStatus = "pending" | "running" | "complete" | "failed";

export interface ScanStatusResponse {
  id: string;
  url: string;
  status: "pending" | "running" | "complete" | "failed";
  progress_step: number;
  sub_tasks: Record<string, SubTaskStatus> | null;
  report: ScanReport | null;
  error: string | null;
  pdf_url: string | null;
  created_at: string;
  user_id: string | null;
}

export interface DashboardRecentScan {
  id: string;
  url: string;
  status: "pending" | "running" | "complete" | "failed";
  progress_step: number;
  risk_score: number | null;
  findings_count: number;
  pdf_url: string | null;
  created_at: string;
}

export interface DashboardCategoryCount {
  label: string;
  count: number;
}

export interface DashboardAssetCount {
  asset: string;
  count: number;
}

export interface DashboardDayCount {
  date: string;
  scans: number;
  findings: number;
}

export interface ScanDashboardResponse {
  total_scans: number;
  complete_scans: number;
  active_scans: number;
  failed_scans: number;
  reports_ready: number;
  total_findings: number;
  average_risk_score: number | null;
  severity_counts: Record<"critical" | "high" | "medium" | "low" | "info", number>;
  category_counts: DashboardCategoryCount[];
  top_assets: DashboardAssetCount[];
  scans_by_day: DashboardDayCount[];
  recent_scans: DashboardRecentScan[];
}

export interface ScanEventMessage {
  type: "scan.events.connected" | "scan.created" | "scan.updated" | "scan.completed" | "scan.failed";
  user_id?: string | null;
  scan?: DashboardRecentScan;
}

export interface AdminStats {
  total_users: number;
  total_scans: number;
  active_scans: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  monthly_scan_limit: number;
  active_scan_limit: number;
  schedule_limit: number;
  is_active: boolean;
  created_at: string;
  scan_count: number;
}

export interface AdminScan {
  id: string;
  url: string;
  status: string;
  progress_step: number;
  error: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
}

export interface ApiError {
  detail: string;
}

export interface AdminScanPDFResponse {
  pdf_url: string;
  view_url: string;
  download_url: string;
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include", // Send cookies
    ...options,
    headers,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Request failed with status ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  // Handle empty responses (204, etc.)
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text);
}

// ── Auth API ─────────────────────────────────────────────────────

export async function signupUser(
  name: string,
  email: string,
  password: string,
  otp: string,
  timezone?: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password, otp, timezone }),
  });
}

export async function requestSignupOtp(
  name: string,
  email: string,
  password: string,
  timezone?: string
): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/api/auth/signup/otp", {
    method: "POST",
    body: JSON.stringify({ name, email, password, timezone }),
  });
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutUser(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<UserResponse> {
  return apiFetch<UserResponse>("/api/auth/me");
}

export async function updateAccountProfile(name: string): Promise<UserResponse> {
  return apiFetch<UserResponse>("/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function updateAccountTimezone(timezone: string): Promise<UserResponse> {
  return apiFetch<UserResponse>("/api/account/timezone", {
    method: "PATCH",
    body: JSON.stringify({ timezone }),
  });
}

export async function startEmailChange(new_email: string, current_password: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/api/account/email-change/start", {
    method: "POST",
    body: JSON.stringify({ new_email, current_password }),
  });
}

export async function confirmEmailChange(new_email: string, otp: string): Promise<UserResponse> {
  return apiFetch<UserResponse>("/api/account/email-change/confirm", {
    method: "POST",
    body: JSON.stringify({ new_email, otp }),
  });
}

export async function changeAccountPassword(current_password: string, new_password: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/api/account/password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

export async function getAccountUsage(): Promise<AccountUsage> {
  return apiFetch<AccountUsage>("/api/account/usage");
}

export async function listScanTargets(): Promise<ScanTarget[]> {
  return apiFetch<ScanTarget[]>("/api/targets");
}

export async function createScanTarget(target: string): Promise<ScanTarget> {
  return apiFetch<ScanTarget>("/api/targets", {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}

export async function verifyScanTarget(targetId: string): Promise<ScanTargetVerifyResponse> {
  return apiFetch<ScanTargetVerifyResponse>(`/api/targets/${targetId}/verify`, {
    method: "POST",
  });
}

// ── Scan API ─────────────────────────────────────────────────────

export async function createScan(url: string): Promise<ScanCreateResponse> {
  return apiFetch<ScanCreateResponse>("/api/scans", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getScan(scanId: string): Promise<ScanStatusResponse> {
  return apiFetch<ScanStatusResponse>(`/api/scans/${scanId}`);
}

export async function listMyScans(): Promise<ScanStatusResponse[]> {
  return apiFetch<ScanStatusResponse[]>("/api/scans");
}

export async function getScanDashboard(): Promise<ScanDashboardResponse> {
  return apiFetch<ScanDashboardResponse>("/api/scans/dashboard");
}

export async function listSchedules(): Promise<ScheduledScan[]> {
  return apiFetch<ScheduledScan[]>("/api/schedules");
}

export async function createSchedule(payload: ScheduledScanPayload): Promise<ScheduledScan> {
  return apiFetch<ScheduledScan>("/api/schedules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSchedule(
  scheduleId: string,
  payload: Partial<ScheduledScanPayload>
): Promise<ScheduledScan> {
  return apiFetch<ScheduledScan>(`/api/schedules/${scheduleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await apiFetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
}

export function getScanEventsWebSocketUrl(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const base = new URL(apiBase || window.location.origin, window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/api/scans/ws";
  base.search = "";
  base.hash = "";
  return base.toString();
}

export async function cancelScan(scanId: string): Promise<ScanCancelResponse> {
  return apiFetch<ScanCancelResponse>(`/api/scans/${scanId}/cancel`, {
    method: "POST",
  });
}

// ── Admin API ────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/api/admin/stats");
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>("/api/admin/users");
}

export async function getAdminScans(): Promise<AdminScan[]> {
  return apiFetch<AdminScan[]>("/api/admin/scans");
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function generateScanPDF(scanId: string): Promise<AdminScanPDFResponse> {
  return apiFetch<AdminScanPDFResponse>(`/api/scans/${scanId}/generate-pdf`, {
    method: "POST",
  });
}

export function getScanPDFViewUrl(scanId: string): string {
  return `/api/scans/${scanId}/pdf`;
}

export function getScanPDFDownloadUrl(scanId: string): string {
  return `/api/scans/${scanId}/pdf?download=1`;
}

// ── Token Usage API ──────────────────────────────────────────────

export interface TokenUsageRecord {
  id: string;
  scan_id: string;
  user_id: string | null;
  user_email: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string | null;
  estimated_cost: string | null;
  created_at: string;
}

export interface TokenUsageByUser {
  user_id: string;
  user_email: string;
  total_tokens: number;
  scan_count: number;
}

export interface TokenUsageByModel {
  model: string;
  total_tokens: number;
  scan_count: number;
}

export interface TokenUsageStats {
  total_tokens_all_time: number;
  total_scans: number;
  total_cost_estimate: string;
  by_user: TokenUsageByUser[];
  by_model: TokenUsageByModel[];
  recent_usage: TokenUsageRecord[];
}

export async function getTokenUsageStats(): Promise<TokenUsageStats> {
  return apiFetch<TokenUsageStats>("/api/admin/token-usage");
}
