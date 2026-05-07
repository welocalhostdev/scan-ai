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
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: UserResponse;
  message: string;
}

export interface ScanCreateResponse {
  scan_id: string;
}

export interface Finding {
  id: string;
  title: string;
  category?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  evidence?: string;
  what_it_means: string;
  how_to_fix: string[];
  affected: string;
}

export interface ScanReport {
  summary: string;
  risk_score: number;
  priority_actions?: string[];
  findings: Finding[];
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
  created_at: string;
  user_id: string | null;
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
  pdf_url: string | null;
  report: ScanReport | null;
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include", // Send cookies
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
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

export async function generateAdminScanPDF(scanId: string): Promise<AdminScanPDFResponse> {
  return apiFetch<AdminScanPDFResponse>(`/api/admin/scans/${scanId}/generate-pdf`, {
    method: "POST",
  });
}

export function getAdminScanPDFViewUrl(scanId: string): string {
  return `/api/admin/scans/${scanId}/pdf`;
}

export function getAdminScanPDFDownloadUrl(scanId: string): string {
  return `/api/admin/scans/${scanId}/pdf?download=1`;
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
