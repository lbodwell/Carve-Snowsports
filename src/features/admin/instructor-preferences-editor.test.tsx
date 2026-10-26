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
