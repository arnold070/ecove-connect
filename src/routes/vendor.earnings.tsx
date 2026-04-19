import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/earnings")({
  component: () => <VendorStub title="Earnings & Payouts" subtitle="Track your revenue and request withdrawals" />,
});
