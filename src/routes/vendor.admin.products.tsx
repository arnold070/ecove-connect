import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor/admin/products")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/products" });
  },
});
