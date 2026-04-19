import { Construction } from "lucide-react";
import { VendorShell } from "@/components/vendor-shell";

export function VendorStub({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <VendorShell title={title} subtitle={subtitle}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-7 w-7" />
        </span>
        <h3 className="mt-4 font-display text-lg font-bold text-foreground">Coming soon</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This section is part of the vendor dashboard scaffolding. We&apos;ll wire it to live
          data from Lovable Cloud next.
        </p>
      </div>
    </VendorShell>
  );
}
