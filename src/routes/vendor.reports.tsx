import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/reports")({
  component: () => <VendorStub title="Sales Reports" subtitle="Performance over time" />,
});
