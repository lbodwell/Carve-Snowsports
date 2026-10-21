// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentRoster } from "./student-roster";
import type { ComponentProps, ReactNode } from "react";
import { registrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => (
    <a href="#student">{children}</a>
  ),
}));
vi.mock("@/server/functions/student-roster", () => ({
  registerStudent: vi.fn(),
}));
afterEach(cleanup);
const rows: ComponentProps<typeof StudentRoster>["students"] = Array.from(
  { length: 60 },
  (_, i) => ({
    id: `student-${i}`,
    firstName: `Student ${String(i).padStart(2, "0")}`,
    lastName: "Fixture",
    dateOfBirth: null,
    registrationId: `registration-${i}`,
    registrationStatus: "active",
    disciplineLabel: "Ski",
    abilityLevelLabel: "Level 7",
    programId: "program",
    programName: "Weekend lessons",
    seasonName: "Winter 2027",
    medicalInfo: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    notes: "",
    schedule: registrationScheduleSummary(
      {
        sourceKey: `registration-${i}`,
        weekday: i % 2 ? "Sunday" : "Saturday",
        session: "Full Day",
        productDate: "1/10/2027",
        saleDate: "3/12/2026",
      },
      [],
    ),
  }),
);
describe("registration roster", () => {
  it("filters lesson days across the full result set before pagination", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<StudentRoster students={rows} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Lesson day" }), {
      key: " ",
    });
    fireEvent.click(await screen.findByRole("option", { name: /^Sunday$/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      26,
    );
    expect(screen.queryByText("Student 00 Fixture")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      6,
    );
  });
  it("paginates registrations, changes page size and resets the page when searching", () => {
    render(<StudentRoster students={rows} />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      26,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByText("Student 25 Fixture")).toBeDefined();
    expect(screen.queryByText("Student 00 Fixture")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search students"), {
      target: { value: "Student 00" },
    });
    expect(screen.getByText("Student 00 Fixture")).toBeDefined();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: /^Next$/ }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("Rows per page"), {
      target: { value: "50" },
    });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      51,
    );
  });
  it("opens the selected signup's dates when one student has multiple registrations", () => {
    render(
      <StudentRoster
        students={[
          rows[0]!,
          {
            ...rows[0]!,
            registrationId: "second-signup",
            schedule: rows[1]!.schedule,
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /View registration.*Sunday/ }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Sunday", { exact: true }),
    ).toBeDefined();
    expect(
      within(screen.getByRole("dialog")).getByText("10:00–15:00", {
        exact: true,
      }),
    ).toBeDefined();
    expect(
      within(screen.getByRole("dialog")).getByText("3/12/2026", {
        exact: true,
      }),
    ).toBeDefined();
  });
});
