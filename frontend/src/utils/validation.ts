const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Basic shape check for an email address (the server validates again). */
export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value);
