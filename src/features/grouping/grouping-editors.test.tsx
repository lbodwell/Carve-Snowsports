// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GroupConfiguration } from "./grouping-editors";
import { createGroupingWorkspaceFixture } from "@/test/factories/grouping-workspace";

afterEach(cleanup);
it("offers eligible instructors, hides unavailable/unqualified/busy choices and keeps assigned people removable", () => {
  const workspace = createGroupingWorkspaceFixture();
  const base = workspace.instructors[0]!;
  base.preferences = [
    {
      weekday: 6,
      teachingSlot: "am",
      startsAt: "00:00",
      endsAt: "23:59",
      minimumAge: null,
      maximumAge: null,
      minimumLevel: null,
      maximumLevel: null,
    },
  ];
  workspace.instructors = [
    { ...base, id: "available", firstName: "Available" },
    {
      ...base,
      id: "wrong-day",
      firstName: "WrongDay",
      preferences: [{ ...base.preferences[0]!, weekday: 0 }],
    },
    {
      ...base,
      id: "unqualified",
      firstName: "Snowboard",
      disciplineIds: ["snowboard"],
    },
    { ...base, id: "busy", firstName: "Busy" },
    {
      ...base,
      id: "assigned-ineligible",
      firstName: "Assigned",
      preferences: [],
    },
  ];
  workspace.groups[0]!.instructorIds = ["assigned-ineligible"];
  workspace.groups[0]!.leadInstructorId = null;
  workspace.timeSlots.push({
    ...workspace.timeSlots[0]!,
    id: "full",
    endsAt: "15:00",
  });
  workspace.groups = [
    ...workspace.groups,
    {
      ...workspace.groups[0]!,
      id: "overlap",
      timeSlotId: "full",
      instructorIds: ["busy"],
    },
  ];
  const save = vi.fn();
  render(
    <GroupConfiguration
      workspace={workspace}
      group={workspace.groups[0]!}
      busy={false}
      readOnly={false}
      onDelete={vi.fn()}
      onSave={save}
    />,
  );
  expect(screen.getByText("Available Lee")).toBeTruthy();
  expect(screen.getByText("Assigned Lee")).toBeTruthy();
  for (const name of ["WrongDay Lee", "Snowboard Lee", "Busy Lee"])
    expect(screen.queryByText(name)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /Available Lee/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Assigned Lee/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ instructorIds: ["available"] }),
  );
});
