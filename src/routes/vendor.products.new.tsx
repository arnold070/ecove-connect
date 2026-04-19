import { createFileRoute } from "@tanstack/react-router";
import { VendorStub } from "@/components/vendor-stub";

export const Route = createFileRoute("/vendor/products/new")({
  component: () => <VendorStub title="Add New Product" subtitle="List a product for admin review" />,
});
