import { Dialog } from "radix-ui";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";

export function RosterRow({
  onOpen,
  children,
  ...props
}: Omit<ComponentProps<typeof TableRow>, "onClick"> & {
  onOpen: (element: HTMLTableRowElement) => void;
}) {
  return (
    <TableRow
      {...props}
      tabIndex={0}
      className="hover:bg-muted/50 focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "button,a,input,select,textarea",
          )
        )
          return;
        onOpen(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onOpen(event.currentTarget);
        }
      }}
    >
      {children}
    </TableRow>
  );
}

export function RosterDetailsDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  restoreFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  restoreFocusTo: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusTo.current?.focus();
          }}
          className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border p-6 shadow-lg"
        >
          <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-muted-foreground text-sm">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RosterPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label="Roster pagination"
    >
      <label className="flex items-center gap-2 text-sm">
        Rows per page
        <select
          className="rounded-md border bg-white p-2"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="text-muted-foreground text-sm">
        {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total} · Page {page} of{" "}
        {pageCount}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPageChange(1)}
        >
          First
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === pageCount}
          onClick={() => onPageChange(pageCount)}
        >
          Last
        </Button>
      </div>
    </div>
  );
}
