// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionSelection } from "./use-session-selection";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
const slots = [
  { id: "am", allowedWeekdays: [6, 0] },
  { id: "pm", allowedWeekdays: [6] },
];
const fallback = { weekday: 6, timeSlotId: "am" };
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  navigate.mockClear();
});
describe("remembered grouping session", () => {
  it("restores a valid saved selection across mounts and honors explicit URL filters", () => {
    localStorage.setItem(
      "org:staff:program",
      JSON.stringify({ weekday: 6, timeSlotId: "pm" }),
    );
    const first = renderHook(() =>
      useSessionSelection(slots, {}, "org:staff:program", fallback),
    );
    expect(first.result.current.timeSlotId).toBe("pm");
    first.unmount();
    const explicit = renderHook(() =>
      useSessionSelection(
        slots,
        { weekday: 0, timeSlotId: "am" },
        "org:staff:program",
        fallback,
      ),
    );
    expect(explicit.result.current).toMatchObject({
      weekday: 0,
      timeSlotId: "am",
    });
  });
  it("saves changes without resetting scroll or adding history entries", async () => {
    const { result } = renderHook(() =>
      useSessionSelection(slots, {}, "org:staff:program", fallback),
    );
    act(() => result.current.selectSession({ weekday: 6, timeSlotId: "pm" }));
    expect(JSON.parse(localStorage.getItem("org:staff:program")!)).toEqual({
      weekday: 6,
      timeSlotId: "pm",
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ replace: true, resetScroll: false }),
      ),
    );
  });
  it("rejects stale slots and days, and tolerates blocked or corrupt storage", () => {
    localStorage.setItem(
      "key",
      JSON.stringify({ weekday: 0, timeSlotId: "deleted" }),
    );
    const first = renderHook(() =>
      useSessionSelection(slots, {}, "key", fallback),
    );
    expect(first.result.current).toMatchObject({
      weekday: 0,
      timeSlotId: "am",
    });
    first.unmount();
    localStorage.setItem("key", "not JSON");
    const second = renderHook(() =>
      useSessionSelection(slots, {}, "key", fallback),
    );
    expect(second.result.current).toMatchObject(fallback);
    second.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    const third = renderHook(() =>
      useSessionSelection(slots, {}, "key", fallback),
    );
    act(() =>
      third.result.current.selectSession({ weekday: 0, timeSlotId: "pm" }),
    );
    expect(third.result.current).toMatchObject({
      weekday: 0,
      timeSlotId: "am",
    });
  });
});
