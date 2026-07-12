import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting Tailwind utilities", () => {
    expect(cn("p-2", "p-4", "text-sm")).toBe("p-4 text-sm");
  });
});
