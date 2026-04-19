import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/policies")({
  component: () => <VendorStub title="Marketplace Policies" subtitle="Rules vendors must follow" />,
});
