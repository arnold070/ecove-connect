import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/admin/orders")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/orders" });
  },
});
