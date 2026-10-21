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
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: actions.invalidate }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/server/functions/grouping-draft", () => ({
  moveRegistration: actions.move,
  createGroupingDraft: actions.create,
  approveGroupingDraft: vi.fn(),
  assignDraftInstructor: vi.fn(),
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
  it("does not call a Sunday student unplaced while viewing Saturday", () => {
    render(createElement(PersistedGroupingBoard, { workspace: fixture() }));
    expect(screen.getByText("No students in this view.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rowan Patel/ })).toBeNull();
    expect(
      screen.getByText("0 students need placement · 1 groups need a lead"),
    ).toBeTruthy();
  });
  it("moves a student directly between groups with the original group attached", async () => {
    const workspace = fixture();
    workspace.groups[1]!.weekday = 6;
    render(createElement(PersistedGroupingBoard, { workspace }));
    fireEvent.click(screen.getByRole("button", { name: /Avery Chen/ }));
    const destination = screen
      .getByText("Group 2")
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
      target: { value: "rowan" },
    });
    expect(screen.getAllByRole("button", { name: /Rowan Patel/ })).toHaveLength(
      1,
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
          weekday: 6,
          timeSlotId: "morning",
        },
      }),
    );
  });
});
