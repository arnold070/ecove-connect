import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/store")({
  component: () => <VendorStub title="My Store Page" subtitle="Customize your public storefront" />,
});
