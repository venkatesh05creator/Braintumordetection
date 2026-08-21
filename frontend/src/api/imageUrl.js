// Shared helper for resolving backend-served image URLs.
//
// Local storage returns relative `/uploads/...` paths that must be resolved
// against the API origin; Cloudinary returns absolute https URLs that pass
// through untouched. Kept in one place so every page/component uses the same
// rule instead of copy-pasting the expression.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads')) return `${API_BASE_URL}${url}`;
  // Other relative paths (e.g. message attachments) resolve against the API origin too
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};
