import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { getLiveChatConfig, type LiveChatConfig } from "@/lib/live-chat.functions";

declare global {
  interface Window {
    Tawk_API?: unknown;
    Tawk_LoadStart?: Date;
    $crisp?: unknown[];
    CRISP_WEBSITE_ID?: string;
    Intercom?: (...args: unknown[]) => void;
    intercomSettings?: Record<string, unknown>;
  }
}

/** Public storefront paths only — admin/auth routes never load the widget. */
const ADMIN_PREFIXES = ["/vendor", "/login", "/signup", "/checkout"];

function isStorefrontPath(pathname: string): boolean {
  return !ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function injectScript(src: string, id: string, attrs: Record<string, string> = {}) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

function removeWidgets() {
  if (typeof document === "undefined") return;
  for (const id of ["tawk-script", "crisp-script", "intercom-script"]) {
    document.getElementById(id)?.remove();
  }
  // Hide iframes the providers inject.
  document
    .querySelectorAll<HTMLElement>(
      'iframe[title*="chat" i], iframe[src*="tawk.to"], iframe[src*="crisp.chat"], iframe[src*="intercom"], #crisp-chatbox, .intercom-lightweight-app',
    )
    .forEach((el) => el.remove());
}

function loadWidget(cfg: LiveChatConfig) {
  if (typeof window === "undefined") return;
  switch (cfg.provider) {
    case "tawk": {
      if (!cfg.tawkPropertyId) return;
      window.Tawk_API = window.Tawk_API || {};
      window.Tawk_LoadStart = new Date();
      injectScript(
        `https://embed.tawk.to/${cfg.tawkPropertyId}/${cfg.tawkWidgetId || "1"}`,
        "tawk-script",
        { crossorigin: "*" },
      );
      return;
    }
    case "crisp": {
      if (!cfg.crispWebsiteId) return;
      window.$crisp = [];
      window.CRISP_WEBSITE_ID = cfg.crispWebsiteId;
      injectScript("https://client.crisp.chat/l.js", "crisp-script");
      return;
    }
    case "intercom": {
      if (!cfg.intercomAppId) return;
      window.intercomSettings = { app_id: cfg.intercomAppId };
      injectScript(`https://widget.intercom.io/widget/${cfg.intercomAppId}`, "intercom-script");
      return;
    }
    default:
      return;
  }
}

interface Props {
  /** When true, force-load even on admin pages (used for the admin preview). */
  force?: boolean;
}

export function LiveChatWidget({ force = false }: Props = {}) {
  const fetchCfg = useServerFn(getLiveChatConfig);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = force || isStorefrontPath(pathname);

  const { data } = useQuery({
    queryKey: ["live-chat-config"],
    queryFn: () => fetchCfg(),
    staleTime: 5 * 60 * 1000,
    enabled: allowed,
  });

  useEffect(() => {
    if (!allowed) {
      removeWidgets();
      return;
    }
    if (data) loadWidget(data);
  }, [data, allowed]);

  return null;
}
