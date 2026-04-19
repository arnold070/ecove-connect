import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/profile")({
  component: () => <VendorStub title="Profile & Bank" subtitle="Account info and payout details" />,
});
