import { HoverCard as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const HoverCard = Primitive.Root;
export const HoverCardTrigger = Primitive.Trigger;
export function HoverCardContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={8}
        className={cn(
          "bg-popover text-popover-foreground z-50 max-h-80 w-80 overflow-y-auto rounded-xl border p-4 text-sm shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
