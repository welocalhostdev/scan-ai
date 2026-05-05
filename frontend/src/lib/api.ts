/**
 * ScanAI — API client.
 * Typed fetch wrappers for auth, scans, and admin endpoints.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  severity: "critical" | "high" | "medium" | "low" | "info";
  what_it_means: string;
  how_to_fix: string[];
  affected: string;
}

export interface ScanReport {
  summary: string;
  risk_score: number;
  findings: Finding[];
}

export interface ScanStatusResponse {
  id: string;
  url: string;
  status: "pending" | "running" | "complete" | "failed";
  progress_step: number;
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
  created_at: string;
  user_email: string | null;
  user_name: string | null;
}

export interface ApiError {
  detail: string;
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
