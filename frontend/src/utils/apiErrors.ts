/**
 * Extract a user-facing message from an API error.
 *
 * The api utility rejects with the original axios error, so the server's
 * message lives at err.response.data.message (some endpoints use `error`, and
 * the auth routes answer validation failures as `{ errors: [{ msg }] }`, in
 * which case the first error's message is used).
 */
interface ErrorBody {
    message?: string;
    error?: string;
    errors?: Array<{ msg?: string; message?: string }>;
}

export const getErrorMessage = (err: unknown, fallback: string): string => {
    const axiosLike = err as { response?: { data?: ErrorBody } } | null | undefined;
    const data = axiosLike?.response?.data;
    const firstValidationError = Array.isArray(data?.errors) ? data.errors[0] : undefined;
    return data?.message
        || data?.error
        || firstValidationError?.msg
        || firstValidationError?.message
        || fallback;
};
