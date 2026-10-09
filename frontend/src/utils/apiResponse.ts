/**
 * List endpoints answer { success, data: rows } once the api interceptor has
 * unwrapped the axios envelope; accept that, { data: rows } and a bare array.
 */
export const unwrapList = <T>(response: unknown): T[] => {
  const body = response as { data?: unknown } | null | undefined;
  const inner = (body?.data as { data?: unknown } | null | undefined)?.data;
  const payload = inner ?? body?.data ?? response;
  return Array.isArray(payload) ? (payload as T[]) : [];
};
