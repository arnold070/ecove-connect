import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor")({
  component: VendorLayout,
  head: () => ({
    meta: [{ title: "Vendor — ecove" }],
  }),
});

function VendorLayout() {
  return <Outlet />;
}
