// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistedGroupingBoard } from "./group-building-workspace";
import { createGroupingWorkspaceFixture as fixture } from "@/test/factories/grouping-workspace";

const actions = vi.hoisted(() => ({
  move: vi.fn().mockResolvedValue({ version: 2 }),
  invalidate: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ id: "draft" }),
  navigate: vi.fn(),
  assign: vi.fn().mockResolvedValue({ version: 2 }),
  split: vi.fn().mockResolvedValue({ version: 2, groupId: "new-group" }),
}));
vi.mock("./group-lifecycle-panel", () => ({ GroupLifecyclePanel: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: actions.invalidate }),
  useNavigate: () => actions.navigate,
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/server/functions/grouping-draft", () => ({
  rebuildDraft: vi.fn(),
  undoDraftRebuild: vi.fn(),
  splitGroup: actions.split,
  moveRegistration: actions.move,
  createGroupingDraft: actions.create,
  approveGroupingDraft: vi.fn(),
  assignDraftInstructor: actions.assign,
  createDraftGroup: vi.fn(),
  deleteDraftGroup: vi.fn(),
  publishGroupingDraft: vi.fn(),
  saveRegistrationSchedule: vi.fn(),
  returnGroupingDraft: vi.fn(),
  suggestRemainingDraftPlacements: vi.fn(),
  submitGroupingDraft: vi.fn(),
  undoDraftOperation: vi.fn(),
  updateDraftGroup: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("administrator group workspace", () => {
  it("flags changed student levels on the placement and program review list, then clears after correction", () => {
    const workspace = fixture();
    workspace.roster[1]!.schedule = { weekday: 0, timeSlotId: "morning" };
    const view = render(createElement(PersistedGroupingBoard, { workspace }));
    expect(screen.queryByText(/placements need review across/)).toBeNull();
    workspace.roster[0]!.abilityLevelId = "level4";
    view.rerender(
      createElement(PersistedGroupingBoard, { workspace: { ...workspace } }),
    );
    expect(
      screen.getByText("1 placements need review across this program"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "Avery Chen" })).getByText(
        /Placement needs review · Level differs from group/,
      ),
    ).toBeTruthy();
    workspace.roster[0]!.abilityLevelId = "level3";
    view.rerender(
      createElement(PersistedGroupingBoard, { workspace: { ...workspace } }),
    );
    expect(screen.queryByText(/placements need review across/)).toBeNull();
  });
  it("shows a misplaced student even when viewing another session", () => {
    const workspace = fixture();
    workspace.roster[1]!.abilityLevelId = "level4";
    workspace.roster[1]!.schedule = { weekday: 0, timeSlotId: "morning" };
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByText(/placements need review across/));
    fireEvent.click(
      screen.getByRole("button", { name: "Rowan Patel · Sunday · Morning" }),
    );
    expect(
      within(screen.getByRole("region", { name: "Group board" })).getByRole(
        "group",
        { name: "Rowan Patel" },
      ),
    ).toBeTruthy();
  });
  it("keeps each student's notes inside their own card in the side panel", () => {
    const workspace = fixture();
    workspace.roster[0]!.medicalNotes = "Carry an inhaler";
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const pool = within(screen.getByRole("region", { name: "Student pool" }));
    const card = within(pool.getByRole("group", { name: "Avery Chen" }));
    const student = card.getByRole("button", { name: /Avery Chen.*Level/ });
    fireEvent.click(
      card.getByRole("button", { name: "View notes for Avery Chen" }),
    );
    expect(student.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(screen.getByRole("dialog")).getByText("Carry an inhaler"),
    ).toBeTruthy();
  });
  it("keeps notes and the student together inside lesson groups", () => {
    const workspace = fixture();
    workspace.roster[0]!.medicalNotes = "Carry an inhaler";
    render(createElement(PersistedGroupingBoard, { workspace }));
    const card = screen.getByRole("group", { name: "Avery Chen" });
    expect(card.className).not.toContain("border-transparent");
    const student = within(card).getByRole("button", {
      name: /Avery Chen.*Level/,
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "View notes for Avery Chen" }),
    );
    expect(student.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(screen.getByRole("dialog")).getByText("Carry an inhaler"),
    ).toBeTruthy();
  });
  it("does not call a Sunday student unplaced while viewing Saturday", () => {
    render(createElement(PersistedGroupingBoard, { workspace: fixture() }));
    expect(
      screen.getByText(/Everyone registered for this session is placed/),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Student pool" })).queryByRole(
        "button",
        { name: /Rowan Patel/ },
      ),
    ).toBeNull();
    fireEvent.click(screen.getByText(/Schedule review ·/));
    expect(
      within(screen.getByLabelText("Schedule review")).getByRole("button", {
        name: /Rowan Patel/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("0 students need placement · 1 groups need a lead"),
    ).toBeTruthy();
  });
  it("limits both pools to the selected session, including All students", () => {
    const workspace = fixture();
    workspace.roster.push({
      ...workspace.roster[0]!,
      registrationId: "other-cohort",
      firstName: "Other",
      schedule: { weekday: 6, timeSlotId: "second-session" },
    });
    workspace.instructors[0]!.preferences = [
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
    workspace.instructors.push({
      ...workspace.instructors[0]!,
      id: "unavailable",
      firstName: "Unavailable",
      preferences: [],
    });
    workspace.instructors.push({
      ...workspace.instructors[0]!,
      id: "busy",
      firstName: "Busy",
    });
    workspace.timeSlots.push({
      ...workspace.timeSlots[0]!,
      id: "full-day",
      endsAt: "16:00",
    });
    workspace.groups = [
      ...workspace.groups,
      {
        ...workspace.groups[0]!,
        id: "busy-group",
        timeSlotId: "full-day",
        instructorIds: ["busy"],
        leadInstructorId: "busy",
      },
    ];
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const pool = within(screen.getByRole("region", { name: "Student pool" }));
    expect(pool.getByRole("button", { name: /Avery Chen/ })).toBeTruthy();
    expect(
      pool.queryByRole("button", { name: /Rowan Patel|Other Chen/ }),
    ).toBeNull();
    const instructors = within(
      screen
        .getByRole("heading", { name: "Instructors for this session" })
        .closest("section")!,
    );
    expect(instructors.getByText("Jordan Lee")).toBeTruthy();
    expect(instructors.queryByText("Unavailable Lee")).toBeNull();
    expect(instructors.getByText("Busy Lee")).toBeTruthy();
    expect(
      instructors.getAllByText("Assigned · overlaps").length,
    ).toBeGreaterThan(0);
  });
  it("moves a student directly between groups with the original group attached", async () => {
    const workspace = fixture();
    workspace.groups[1]!.weekday = 6;
    workspace.groups[1]!.instructorIds = ["jordan"];
    workspace.groups[1]!.leadInstructorId = "jordan";
    const assignments = workspace.assignments.map((row) => ({
      ...row,
      draftId: "draft",
      overrideReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    for (let index = 0; index < 6; index++) {
      workspace.roster.push({
        ...workspace.roster[1]!,
        registrationId: `extra-${index}`,
        firstName: `Extra${index}`,
      });
      assignments.push({
        registrationId: `extra-${index}`,
        draftGroupId: "group2",
        draftId: "draft",
        overrideReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    workspace.assignments = assignments;
    render(createElement(PersistedGroupingBoard, { workspace }));
    expect(
      screen.getByText(/Group too big for assigned staffing/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Student pool" })).getByRole(
        "button",
        { name: /Avery Chen/ },
      ),
    );
    const destination = screen
      .getByText("Ski · Age band needed · Level 3 · Jordan Lee · B")
      .closest<HTMLElement>('[data-slot="card"]')!;
    fireEvent.click(
      within(destination).getByRole("button", { name: "Place student here" }),
    );
    await waitFor(() =>
      expect(actions.move).toHaveBeenCalledWith({
        data: expect.objectContaining({
          registrationId: "avery",
          fromGroupId: "group1",
          groupId: "group2",
          baseVersion: 1,
        }),
      }),
    );
    expect(actions.invalidate).toHaveBeenCalled();
  });
  it("finds a student without repeating the entire roster inside each group", () => {
    render(createElement(PersistedGroupingBoard, { workspace: fixture() }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find a student" }), {
      target: { value: "avery" },
    });
    expect(
      within(screen.getByRole("region", { name: "Student pool" })).getAllByRole(
        "button",
        { name: /Avery Chen/ },
      ),
    ).toHaveLength(1);
  });
  it("prompts for a level exception before moving a student", async () => {
    const workspace = fixture();
    workspace.groups[1]!.weekday = 6;
    workspace.groups[1]!.abilityLevelId = "different-level";
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Student pool" })).getByRole(
        "button",
        { name: /Avery Chen/ },
      ),
    );
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Place student here" })
        .find((button) => !(button as HTMLButtonElement).disabled)!,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(actions.move).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Placement reason" }),
      { target: { value: "Reviewed by coordinator" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Move student" }));
    await waitFor(() =>
      expect(actions.move).toHaveBeenCalledWith({
        data: expect.objectContaining({
          overrideReason: "Reviewed by coordinator",
          groupId: "group2",
        }),
      }),
    );
  });
  it("creates suggested groups with the selected session", async () => {
    const workspace = fixture();
    workspace.draft = null;
    workspace.groups = [];
    workspace.assignments = [];
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith({
        data: {
          programId: "program",
          mode: "suggested",
          weekday: 0,
          timeSlotId: "morning",
        },
      }),
    );
  });
  it("adds a Saturday AM ski instructor by dropping on the card and preserves the current lead", async () => {
    const workspace = fixture();
    const preference = {
      weekday: 6,
      teachingSlot: "am" as const,
      startsAt: "00:00",
      endsAt: "23:59",
      minimumAge: null,
      maximumAge: null,
      minimumLevel: null,
      maximumLevel: null,
    };
    workspace.instructors[0]!.preferences = [preference];
    workspace.instructors.push({
      ...workspace.instructors[0]!,
      id: "new-instructor",
      firstName: "Available",
      lastName: "Skier",
    });
    render(createElement(PersistedGroupingBoard, { workspace }));
    const group = screen.getByLabelText(/^Lesson group:/);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
    };
    const pool = screen
      .getByRole("heading", { name: "Instructors for this session" })
      .closest("section")!;
    fireEvent.dragStart(
      within(pool).getByText("Available Skier").closest('[draggable="true"]')!,
      { dataTransfer },
    );
    fireEvent.dragOver(group, { dataTransfer });
    fireEvent.drop(group, { dataTransfer });
    await waitFor(() =>
      expect(actions.assign).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: "group1",
          instructorIds: ["jordan", "new-instructor"],
          leadInstructorId: "jordan",
        }),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("makes the first dropped instructor the lead, ignores duplicates and rejects ineligible drops", async () => {
    const workspace = fixture();
    workspace.groups[0]!.instructorIds = [];
    workspace.groups[0]!.leadInstructorId = null;
    workspace.instructors[0]!.preferences = [
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
    workspace.instructors.push({
      ...workspace.instructors[0]!,
      id: "wrong-discipline",
      disciplineIds: ["snowboard"],
    });
    const rendered = render(
      createElement(PersistedGroupingBoard, { workspace }),
    );
    const group = screen.getByLabelText(/^Lesson group:/);
    fireEvent.drop(group, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/carve-instructor" ? "wrong-discipline" : "",
      },
    });
    expect(actions.assign).not.toHaveBeenCalled();
    fireEvent.drop(group, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/carve-instructor" ? "jordan" : "",
      },
    });
    await waitFor(() =>
      expect(actions.assign).toHaveBeenCalledWith({
        data: expect.objectContaining({
          instructorIds: ["jordan"],
          leadInstructorId: "jordan",
        }),
      }),
    );
    await waitFor(() => expect(actions.invalidate).toHaveBeenCalled());
    rendered.unmount();
    actions.assign.mockClear();
    workspace.groups[0]!.instructorIds = ["jordan"];
    workspace.groups[0]!.leadInstructorId = "jordan";
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.drop(screen.getByLabelText(/^Lesson group:/), {
      dataTransfer: { getData: () => "jordan" },
    });
    expect(actions.assign).not.toHaveBeenCalled();
  });
  it("makes splitting discoverable and only allows a nonempty proper subset", async () => {
    const workspace = fixture();
    workspace.roster.push({
      ...workspace.roster[0]!,
      registrationId: "second",
      firstName: "Second",
    });
    workspace.assignments = [
      ...workspace.assignments.map((row) => ({ ...row, overrideReason: null })),
      {
        ...workspace.assignments[0]!,
        overrideReason: null,
        registrationId: "second",
        draftGroupId: "group1",
      },
    ];
    render(createElement(PersistedGroupingBoard, { workspace }));
    const group = within(screen.getByLabelText(/^Lesson group:/));
    fireEvent.click(group.getByRole("button", { name: "Split group" }));
    expect(group.getByText("0 of 2 selected")).toBeTruthy();
    expect(
      group
        .getByRole("button", { name: "Split selected (0)" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(group.getByRole("checkbox", { name: /Avery Chen/ }));
    expect(
      group
        .getByRole("button", { name: "Split selected (1)" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(group.getByRole("checkbox", { name: /Second Chen/ }));
    expect(
      group.getByText("Leave at least one student in this group."),
    ).toBeTruthy();
    expect(
      group
        .getByRole("button", { name: "Split selected (2)" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(actions.split).not.toHaveBeenCalled();
    fireEvent.click(group.getByRole("checkbox", { name: /Avery Chen/ }));
    fireEvent.click(group.getByRole("button", { name: "Split selected (1)" }));
    await waitFor(() =>
      expect(actions.split).toHaveBeenCalledWith({
        data: expect.objectContaining({
          draftId: "draft",
          baseVersion: 1,
          groupId: "group1",
          registrationIds: ["second"],
        }),
      }),
    );
    await waitFor(() => expect(group.queryByRole("checkbox")).toBeNull());
    expect(group.getByRole("button", { name: "Split group" })).toBeTruthy();
  });
  it("explains singleton splits and lets selection be cancelled with Escape", () => {
    const workspace = fixture();
    const first = render(createElement(PersistedGroupingBoard, { workspace }));
    const split = screen.getByRole("button", {
      name: "Split group",
    });
    expect(split.hasAttribute("disabled")).toBe(true);
    expect(split.getAttribute("title")).toContain("at least two students");
    first.unmount();
    workspace.roster.push({
      ...workspace.roster[0]!,
      registrationId: "second",
      firstName: "Second",
    });
    workspace.assignments = [
      ...workspace.assignments.map((row) => ({ ...row, overrideReason: null })),
      {
        ...workspace.assignments[0]!,
        overrideReason: null,
        registrationId: "second",
        draftGroupId: "group1",
      },
    ];
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: "Split group" }));
    fireEvent.keyDown(screen.getByLabelText(/^Lesson group:/), {
      key: "Escape",
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Split group" })).toBeTruthy();
  });
  it("opens full notes without selecting the student, and closes without reopening a preview", async () => {
    const workspace = fixture();
    workspace.roster[0]!.placementNotes =
      "Needs a patient instructor and short breaks.";
    workspace.roster[0]!.medicalNotes = "Synthetic medical note";
    render(createElement(PersistedGroupingBoard, { workspace }));
    const student = screen.getByRole("button", { name: /Avery Chen.*Level/ });
    const notes = screen.getByRole("button", {
      name: "View notes for Avery Chen",
    });
    fireEvent.click(notes);
    expect(student.getAttribute("aria-pressed")).toBe("false");
    const drawer = within(screen.getByRole("dialog"));
    expect(
      drawer.getByText("Needs a patient instructor and short breaks."),
    ).toBeTruthy();
    expect(drawer.getByText("Synthetic medical note")).toBeTruthy();
    fireEvent.click(drawer.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(notes);
  });
});
