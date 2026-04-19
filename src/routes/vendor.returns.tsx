import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/returns")({
  component: () => <VendorStub title="Returns" subtitle="Return requests and refunds" />,
});
