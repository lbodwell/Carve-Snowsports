import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton({
  onRefresh,
}: { onRefresh?: () => Promise<unknown> } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-destructive text-sm">
          {error}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await (onRefresh ? onRefresh() : router.invalidate());
          } catch {
            setError("Refresh failed. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw aria-hidden className={busy ? "animate-spin" : ""} />
        {busy ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
