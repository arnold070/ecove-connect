import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/products/")({
  component: () => <VendorStub title="My Products" subtitle="Manage your active catalog" />,
});
