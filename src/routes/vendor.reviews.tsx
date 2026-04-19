import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/reviews")({
  component: () => <VendorStub title="My Reviews" subtitle="Customer ratings and feedback" />,
});
