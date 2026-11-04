// Typed client for the Recruit OS API (served by the same origin).
import useSWR, { type SWRConfiguration } from 'swr';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); this.name = 'ApiError'; }
}

type Body = Record<string, unknown> | unknown[] | undefined;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: Body; raw?: BodyInit; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || (opts.body || opts.raw ? 'POST' : 'GET'),
    headers: opts.raw ? opts.headers : { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/public') && path !== '/api/login') {
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body?: Body) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = unknown>(path: string, body?: Body) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

/** SWR hook bound to the API. `refresh` polls (ms) for live views like the pipeline. */
export function useApi<T>(path: string | null, refresh?: number, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api<T>(p), { refreshInterval: refresh, revalidateOnFocus: true, keepPreviousData: true, ...config });
}
