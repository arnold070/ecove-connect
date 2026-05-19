import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/admin/approvals")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/approvals" });
  },
});
