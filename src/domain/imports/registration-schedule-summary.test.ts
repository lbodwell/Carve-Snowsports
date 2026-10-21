import { describe, expect, it } from "vitest";
import { registrationScheduleSummary } from "./registration-schedule-summary";
import type { ScheduleSlot } from "./registration-schedule-summary";

const slot: ScheduleSlot = {
  id: "full-day",
  label: "Full Day",
  cohort: "season",
  startsAt: "10:00:00",
  endsAt: "15:00:00",
  startsOn: "2027-01-10",
  endsOn: "2027-03-07",
  excludedDates: ["2027-02-14"],
};

describe("registration schedule summary", () => {
  it("uses the season calendar for matched regular sessions without a narrower range", () => {
    expect(
      registrationScheduleSummary(
        { sourceKey: "registration", weekday: "Sunday", session: "Full Day" },
        [{ ...slot, startsOn: null, endsOn: null }],
        { startsOn: "2027-01-01", endsOn: "2027-03-31" },
      ),
    ).toMatchObject({ startsOn: "2027-01-01", endsOn: "2027-03-31" });
  });
  it("keeps purchase, export and recurring lesson dates distinct", () => {
    expect(
      registrationScheduleSummary(
        {
          sourceKey: "registration",
          weekday: "Sunday",
          session: "Full Day",
          productDate: "1/10/2027",
          saleDate: "3/12/2026",
        },
        [slot],
      ),
    ).toMatchObject({
      weekday: "Sunday",
      hours: "10:00–15:00",
      productDate: "1/10/2027",
      saleDate: "3/12/2026",
      startsOn: "2027-01-10",
      endsOn: "2027-03-07",
      excludedDates: ["2027-02-14"],
      status: "Time matched",
    });
  });
  it("shows imported weekend hours even before a session is configured", () => {
    expect(
      registrationScheduleSummary(
        { sourceKey: "registration", weekday: "Saturday", session: "1pm" },
        [],
      ),
    ).toMatchObject({
      hours: "13:00–15:00",
      status: "Needs time review",
      startsOn: null,
    });
  });
  it("does not invent hours or dates for numbered seasonal cohorts", () => {
    expect(
      registrationScheduleSummary(
        {
          sourceKey: "registration",
          weekday: "Thursday",
          session: "Session 2",
        },
        [slot],
      ),
    ).toMatchObject({
      cohort: "Session 2",
      hours: null,
      startsOn: null,
      status: "Needs time review",
    });
  });
  it("uses a reviewed schedule rather than stale imported session labels", () => {
    expect(
      registrationScheduleSummary(
        {
          sourceKey: "registration",
          weekday: "Sunday",
          session: "10am",
          groupingSchedule: { weekday: 6, timeSlotId: slot.id },
        },
        [slot],
      ),
    ).toMatchObject({
      weekday: "Saturday",
      session: "Full Day",
      hours: "10:00–15:00",
    });
  });
  it("leaves manually created registrations without schedule evidence visible", () => {
    expect(registrationScheduleSummary(null, [slot])).toMatchObject({
      weekday: null,
      session: null,
      hours: null,
      productDate: null,
      status: "Schedule not recorded",
    });
  });
});
