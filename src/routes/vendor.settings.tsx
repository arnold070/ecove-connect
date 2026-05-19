import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings" });
  },
});
