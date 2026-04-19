import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/products/pending")({
  component: () => <VendorStub title="Pending Approval" subtitle="Products awaiting admin review" />,
});
