import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/diagnostics")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/diagnostics" });
  },
});
