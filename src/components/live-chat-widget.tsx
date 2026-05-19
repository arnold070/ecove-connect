import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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

export function LiveChatWidget() {
  const fetchCfg = useServerFn(getLiveChatConfig);
  const { data } = useQuery({
    queryKey: ["live-chat-config"],
    queryFn: () => fetchCfg(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) loadWidget(data);
  }, [data]);

  return null;
}
