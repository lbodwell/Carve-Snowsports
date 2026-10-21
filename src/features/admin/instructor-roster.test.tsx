// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { InstructorRoster } from "./instructor-roster";
import {
  archiveInstructor,
  saveInstructor,
} from "@/server/functions/instructors";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/server/functions/instructors", () => ({
  archiveInstructor: vi.fn().mockResolvedValue({}),
  saveInstructor: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/server/functions/audit-history", () => ({
  getInstructorAuditHistory: vi.fn().mockResolvedValue([]),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const rows = Array.from({ length: 60 }, (_, i) => ({
  id: `instructor-${i}`,
  firstName: `Instructor ${String(i).padStart(2, "0")}`,
  lastName: "Fixture",
  phone: `555-${i}`,
  email: `fixture${i}@example.test`,
  notes: "Synthetic instructor",
  disciplines: [{ key: "ski", label: "Ski" }],
}));

describe("instructor roster", () => {
  it("paginates and reports filtered totals independently of the visible page", () => {
    render(<InstructorRoster instructors={rows} />);
    expect(screen.getByRole("status").textContent).toContain(
      "60 matching instructors",
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      26,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByText("Instructor 25 Fixture")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain(
      "60 matching instructors",
    );
    fireEvent.change(screen.getByLabelText("Search instructors"), {
      target: { value: "Instructor 00" },
    });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "1 matching instructor",
    );
  });
  it("opens details from a contact cell and archives only after confirmation inside details", async () => {
    render(<InstructorRoster instructors={[rows[0]!]} />);
    expect(
      screen.queryByRole("button", { name: "Archive instructor" }),
    ).toBeNull();
    fireEvent.click(screen.getByText("fixture0@example.test"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Archive instructor" }));
    expect(archiveInstructor).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /^Archive$/,
      }),
    );
    await waitFor(() =>
      expect(archiveInstructor).toHaveBeenCalledWith({
        data: { instructorId: "instructor-0" },
      }),
    );
  });
  it("opens with the keyboard and edits inside the details dialog", async () => {
    render(<InstructorRoster instructors={[rows[0]!]} />);
    fireEvent.keyDown(screen.getByRole("row", { name: /View instructor/ }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit instructor" }),
    );
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "555-9999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save instructor" }));
    await waitFor(() =>
      expect(saveInstructor).toHaveBeenCalledWith({
        data: expect.objectContaining({
          instructorId: "instructor-0",
          phone: "555-9999",
        }),
      }),
    );
  });
});
