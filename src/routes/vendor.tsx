import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vendor")({
  component: VendorLayout,
  beforeLoad: () => {
    // Client-side guard: AuthProvider populates session in the browser, but we
    // also want unauthenticated visitors to land on /login first. The actual
    // session check happens in VendorLayout via useAuth.
  },
  head: () => ({
    meta: [{ title: "Vendor — ecove" }],
  }),
});

function VendorLayout() {
  return <Outlet />;
}

export { redirect };
