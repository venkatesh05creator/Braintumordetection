// Shared helper for resolving backend API base URL and image URLs.
//
// In same-domain deployments (e.g. FastAPI serving frontend, reverse proxy, or Vite proxy),
// API_BASE_URL defaults to the relative path '/api'. This prevents requests from targeting
// the visitor's own localhost:8000.
//
// If VITE_API_BASE_URL is explicitly set (for cross-domain deployments), it is prepended.

export const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export const API_BASE_URL = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : '/api';

export const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/uploads')) return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${url}` : url;
  // Other relative paths (e.g. message attachments) resolve against backend origin or relative path
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${normalized}` : normalized;
};
