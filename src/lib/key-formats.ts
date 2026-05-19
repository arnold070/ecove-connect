/**
 * Client-safe format validators for provider API keys.
 * Returns null when valid, or a human-readable error message.
 */
export type KeyValidator = (value: string) => string | null;

const nonEmpty: KeyValidator = (v) =>
  v.trim().length === 0 ? "Value cannot be empty" : null;

export const KEY_VALIDATORS: Record<string, KeyValidator> = {
  PAYSTACK_SECRET_KEY: (v) =>
    /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(v.trim())
      ? null
      : "Must start with sk_test_ or sk_live_ followed by 20+ chars",
  PAYSTACK_PUBLIC_KEY: (v) =>
    /^pk_(test|live)_[A-Za-z0-9]{20,}$/.test(v.trim())
      ? null
      : "Must start with pk_test_ or pk_live_ followed by 20+ chars",
  PAYSTACK_WEBHOOK_SECRET: (v) =>
    v.trim().length >= 16 ? null : "Webhook secret should be at least 16 chars",
  PAYSTACK_CALLBACK_URL: (v) =>
    /^https?:\/\/.+/i.test(v.trim()) ? null : "Must be a valid http(s) URL",

  STRIPE_SECRET_KEY: (v) =>
    /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(v.trim())
      ? null
      : "Must start with sk_test_ or sk_live_",

  CLOUDINARY_CLOUD_NAME: (v) =>
    /^[a-z0-9_-]{2,}$/i.test(v.trim()) ? null : "Lowercase letters, digits, _ and - only",
  CLOUDINARY_API_KEY: (v) =>
    /^[0-9]{8,}$/.test(v.trim()) ? null : "Cloudinary API key is numeric (8+ digits)",
  CLOUDINARY_API_SECRET: (v) =>
    v.trim().length >= 20 ? null : "API secret should be at least 20 chars",

  RESEND_API_KEY: (v) =>
    /^re_[A-Za-z0-9_]{20,}$/.test(v.trim()) ? null : "Must start with re_ and be 20+ chars",
  RESEND_FROM_EMAIL: (v) =>
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim()) ||
    /^.+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(v.trim())
      ? null
      : 'Use an email like "Brand <hi@yourdomain.com>"',

  LIVE_CHAT_PROVIDER: (v) =>
    ["none", "tawk", "crisp", "intercom"].includes(v.trim().toLowerCase())
      ? null
      : "Provider must be one of: none, tawk, crisp, intercom",
  TAWK_PROPERTY_ID: (v) =>
    /^[a-f0-9]{20,}$/i.test(v.trim()) ? null : "Tawk property id is a hex string",
  CRISP_WEBSITE_ID: (v) =>
    /^[a-f0-9-]{20,}$/i.test(v.trim()) ? null : "Crisp website id looks like a UUID",
  INTERCOM_APP_ID: (v) =>
    /^[a-z0-9]{6,}$/i.test(v.trim()) ? null : "Intercom app id is alphanumeric",
};

/** Returns the test service id to run after saving this key, if any. */
export const KEY_TO_TEST_SERVICE: Record<
  string,
  "paystack" | "stripe" | "cloudinary" | "resend" | "smtp" | "sentry" | "paystack_webhook" | undefined
> = {
  PAYSTACK_SECRET_KEY: "paystack",
  PAYSTACK_WEBHOOK_SECRET: "paystack_webhook",
  STRIPE_SECRET_KEY: "stripe",
  CLOUDINARY_CLOUD_NAME: "cloudinary",
  CLOUDINARY_API_KEY: "cloudinary",
  CLOUDINARY_API_SECRET: "cloudinary",
  RESEND_API_KEY: "resend",
  SENTRY_DSN: "sentry",
  SMTP_HOST: "smtp",
  SMTP_PORT: "smtp",
  SMTP_USERNAME: "smtp",
  SMTP_PASSWORD: "smtp",
};

export function validateKey(key: string, value: string): string | null {
  const v = KEY_VALIDATORS[key];
  if (!v) return nonEmpty(value);
  return v(value);
}
