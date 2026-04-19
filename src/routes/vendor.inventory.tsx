import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/inventory")({
  component: () => <VendorStub title="Inventory" subtitle="Stock levels and bulk updates" />,
});
