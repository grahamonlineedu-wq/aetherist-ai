const configuredApiUrl = import.meta.env.VITE_API_URL || '';

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, '');

export function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function requestJson(path, options) {
  const response = await fetch(apiUrl(path), options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('The server returned an invalid response.');
  }

  return payload;
}

export function isTopicsMap(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.values(value).every(Array.isArray),
  );
}
