import { createServerFn } from "@tanstack/react-start";
import { getPlatformValue } from "./platform-settings.server";

export interface LiveChatConfig {
  provider: "none" | "tawk" | "crisp" | "intercom";
  tawkPropertyId?: string;
  tawkWidgetId?: string;
  crispWebsiteId?: string;
  intercomAppId?: string;
}

/**
 * Public (unauthenticated) — returns only non-secret widget identifiers
 * that are embedded in client HTML anyway.
 */
export const getLiveChatConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveChatConfig> => {
    const [providerRaw, tawkProp, tawkWidget, crisp, intercom] = await Promise.all([
      getPlatformValue("LIVE_CHAT_PROVIDER"),
      getPlatformValue("TAWK_PROPERTY_ID"),
      getPlatformValue("TAWK_WIDGET_ID"),
      getPlatformValue("CRISP_WEBSITE_ID"),
      getPlatformValue("INTERCOM_APP_ID"),
    ]);
    const provider = (providerRaw || "none").toLowerCase();
    const allowed = ["none", "tawk", "crisp", "intercom"] as const;
    const safe = (allowed as readonly string[]).includes(provider)
      ? (provider as LiveChatConfig["provider"])
      : "none";
    return {
      provider: safe,
      tawkPropertyId: tawkProp || undefined,
      tawkWidgetId: tawkWidget || "1",
      crispWebsiteId: crisp || undefined,
      intercomAppId: intercom || undefined,
    };
  },
);
