// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstructorPreferencesEditor } from "./instructor-preferences-editor";
import { loadInstructorPreferences } from "@/server/functions/instructors";

vi.mock("@/server/functions/instructors", () => ({
  loadInstructorPreferences: vi.fn(),
}));
afterEach(cleanup);
it("saves independent AM, PM and Full selections and removes only the toggled slot", () => {
  const onChange = vi.fn();
  render(<InstructorPreferencesEditor onChange={onChange} />);
  const saturday = within(
    screen.getByRole("group", { name: "Saturday availability" }),
  );
  for (const name of ["AM", "PM", "Full day"])
    fireEvent.click(saturday.getByRole("button", { name }));
  expect(
    onChange.mock.lastCall![0].map(
      (row: { teachingSlot: string }) => row.teachingSlot,
    ),
  ).toEqual(["am", "pm", "full"]);
  fireEvent.click(saturday.getByRole("button", { name: "AM" }));
  expect(
    onChange.mock.lastCall![0].map(
      (row: { teachingSlot: string }) => row.teachingSlot,
    ),
  ).toEqual(["pm", "full"]);
  expect(
    saturday.getByRole("button", { name: "PM" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("reloads all three saved choices without collapsing them into a single period", async () => {
  vi.mocked(loadInstructorPreferences).mockResolvedValue({
    programs: [],
    preferences: (["am", "pm", "full"] as const).map((teachingSlot) => ({
      weekday: 6,
      teachingSlot,
      startsAt: "00:00",
      endsAt: "23:59",
      minimumAge: 11,
      maximumAge: 13,
      minimumLevel: null,
      maximumLevel: null,
    })),
  });
  const onChange = vi.fn();
  render(
    <InstructorPreferencesEditor
      instructorId="instructor"
      onChange={onChange}
    />,
  );
  const saturday = within(
    await screen.findByRole("group", { name: "Saturday availability" }),
  );
  for (const name of ["AM", "PM", "Full day"])
    expect(
      saturday.getByRole("button", { name }).getAttribute("aria-pressed"),
    ).toBe("true");
  fireEvent.click(saturday.getByRole("button", { name: "PM" }));
  expect(
    onChange.mock.lastCall![0].map(
      (row: { teachingSlot: string }) => row.teachingSlot,
    ),
  ).toEqual(["am", "full"]);
});
