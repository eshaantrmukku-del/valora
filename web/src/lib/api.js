/**
 * Valora API client. All data lives on the server; the browser only holds an httpOnly session cookie.
 * Every state-changing request carries the X-Valora-Client header (CSRF defence, checked by the server).
 */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const headers = { 'X-Valora-Client': '1' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Can’t reach the Valora server. Check your connection and try again.', {
      status: 0,
      code: 'network',
    });
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: e?.code,
      details: e?.details,
    });
  }
  return data;
}

/** Tell mounted views that server data changed so they refetch. */
export function emitStoreChange() {
  window.dispatchEvent(new Event('valora-store-change'));
}

export const gbp = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Math.round(Number(n));
  return `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB')}`;
};
export const pct = (n, dp = 1) => (n == null || Number.isNaN(n) ? '—' : `${Number(n).toFixed(dp)}%`);
