import axios from "axios";
import { installDemoAdapter } from "@/demo/adapter";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/+$/, "");
export const API_BASE = `${BACKEND_URL}/api`;

export function absoluteApiUrl(path = "") {
  return new URL(`${API_BASE}${path}`, window.location.origin).href;
}

export const api = axios.create({ baseURL: API_BASE });
if (process.env.REACT_APP_DEMO_MODE === "true") installDemoAdapter(api);

api.interceptors.request.use((config) => {
  const url = config.url || "";
  const isAdmin = url.includes("/admin") || url.includes("/auth/admin") || url.includes("/tickets") || url.includes("/crm/");
  const token = isAdmin
    ? localStorage.getItem("vm_admin_token")
    : localStorage.getItem("vm_customer_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function mediaUrl(u) {
  if (!u) return "";
  if (u.startsWith("/api/")) return `${BACKEND_URL}${u}`;
  return u;
}

export function apiError(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return e?.message || "Something went wrong";
}
