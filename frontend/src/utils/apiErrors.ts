/**
 * Extract a user-facing message from an API error.
 *
 * The api utility rejects with the original axios error, so the server's
 * message lives at err.response.data.message (some endpoints use `error`).
 */
export const getErrorMessage = (err: unknown, fallback: string): string => {
    const axiosLike = err as { response?: { data?: { message?: string; error?: string } } } | null | undefined;
    return axiosLike?.response?.data?.message || axiosLike?.response?.data?.error || fallback;
};
