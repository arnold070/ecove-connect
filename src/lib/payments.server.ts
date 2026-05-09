/**
 * Server-side accessors for payment provider keys.
 * Reads from platform_settings (DB) with env-var fallback.
 */
import { getPlatformValue } from "./platform-settings.server";

export async function getPaystackKeys() {
  const [publicKey, secretKey] = await Promise.all([
    getPlatformValue("PAYSTACK_PUBLIC_KEY"),
    getPlatformValue("PAYSTACK_SECRET_KEY"),
  ]);
  return { publicKey, secretKey };
}

export async function getStripeKeys() {
  const [publishableKey, secretKey] = await Promise.all([
    getPlatformValue("STRIPE_PUBLISHABLE_KEY"),
    getPlatformValue("STRIPE_SECRET_KEY"),
  ]);
  return { publishableKey, secretKey };
}
