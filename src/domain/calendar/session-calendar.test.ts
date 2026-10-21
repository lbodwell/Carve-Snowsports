import { describe, expect, it } from "vitest";
import { sessionLessons, sessionsOverlap } from "./session-calendar";

const morning = { startsAt: "09:00", endsAt: "12:00" };
describe("dated lesson sessions", () => {
  it("keeps numbered seasonal cohorts separate before their dates are known", () => {
    expect(
      sessionsOverlap(
        { ...morning, cohort: "session-1" },
        { ...morning, cohort: "session-2" },
        6,
      ),
    ).toBe(false);
    expect(
      sessionsOverlap({ ...morning, cohort: "session-1" }, morning, 6),
    ).toBe(true);
  });
  it("lets the same staff and child attend successive seasonal cohorts", () => {
    expect(
      sessionsOverlap(
        { ...morning, startsOn: "2027-01-01", endsOn: "2027-01-31" },
        { ...morning, startsOn: "2027-02-01", endsOn: "2027-02-28" },
        6,
      ),
    ).toBe(false);
  });
  it("checks an actual shared weekday after both holiday lists", () => {
    const a = {
      ...morning,
      startsOn: "2027-01-01",
      endsOn: "2027-01-09",
      excludedDates: ["2027-01-02"],
    };
    expect(sessionsOverlap(a, { ...a, excludedDates: ["2027-01-09"] }, 6)).toBe(
      false,
    );
    expect(sessionsOverlap(a, { ...a, excludedDates: [] }, 6)).toBe(true);
  });
  it("keeps full-day and morning conflicts and adjacent-time compatibility", () => {
    expect(
      sessionsOverlap(morning, { startsAt: "09:00", endsAt: "16:00" }, 6),
    ).toBe(true);
    expect(
      sessionsOverlap(morning, { startsAt: "12:00", endsAt: "16:00" }, 6),
    ).toBe(false);
  });
  it("publishes only the selected cohort dates, excluding holidays", () => {
    expect(
      sessionLessons(
        {
          startsOn: "2027-01-09",
          endsOn: "2027-01-30",
          excludedDates: ["2027-01-16"],
        },
        { startsOn: "2027-01-01", endsOn: "2027-03-31" },
        6,
        "session-1",
      ).map((row) => row.lessonDate),
    ).toEqual(["2027-01-09", "2027-01-23", "2027-01-30"]);
  });
});
