import axios from "axios";
import { API_BASE_URL, API_ORIGIN } from "../config";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// The API hands back server-rooted paths like "/api/auth/avatar/<file>".
// Those need the API host in front of them to be usable in an <img src>,
// since the Vite dev server is on a different origin.

export function assetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("yasodha_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("yasodha_access_token");
      localStorage.removeItem("yasodha_refresh_token");
      localStorage.removeItem("yasodha_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
