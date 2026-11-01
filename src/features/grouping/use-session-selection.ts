import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { GroupingView } from "@/domain/grouping/workspace-query";
import type { RegistrationSchedule } from "@/domain/grouping/registration-schedule";
import { validSessionSelection } from "@/domain/grouping/session-selection";

type Slot = { id: string; allowedWeekdays: Array<number> };

function chooseSession(
  slots: Array<Slot>,
  requested: Partial<RegistrationSchedule>,
): RegistrationSchedule {
  if (requested.weekday === undefined && requested.timeSlotId) {
    const slot = slots.find((item) => item.id === requested.timeSlotId);
    if (slot?.allowedWeekdays[0] !== undefined)
      return { weekday: slot.allowedWeekdays[0], timeSlotId: slot.id };
  }
  return (
    validSessionSelection(slots, requested) ??
    slots
      .flatMap((slot) =>
        slot.allowedWeekdays.map((weekday) => ({
          weekday,
          timeSlotId: slot.id,
        })),
      )
      .find(
        (item) =>
          requested.weekday === undefined || item.weekday === requested.weekday,
      ) ??
    slots.flatMap((slot) =>
      slot.allowedWeekdays.map((weekday) => ({ weekday, timeSlotId: slot.id })),
    )[0] ?? { weekday: 6, timeSlotId: "" }
  );
}

export function useSessionSelection(
  slots: Array<Slot>,
  filters: GroupingView,
  storageKey: string | null,
  fallback: Partial<RegistrationSchedule>,
) {
  const navigate = useNavigate();
  const [selection, setSelection] = useState(() =>
    chooseSession(slots, { ...fallback, ...filters }),
  );
  const urlWeekday = filters.weekday;
  const urlTimeSlotId = filters.timeSlotId;
  useEffect(() => {
    let saved: Partial<RegistrationSchedule> = {};
    try {
      const value: unknown = storageKey
        ? JSON.parse(localStorage.getItem(storageKey) ?? "null")
        : null;
      if (value && typeof value === "object") saved = value;
    } catch {
      /* Corrupt or disabled storage must never block grouping. */
    }
    const explicit = urlWeekday !== undefined || urlTimeSlotId !== undefined;
    const next = chooseSession(
      slots,
      explicit
        ? { weekday: urlWeekday, timeSlotId: urlTimeSlotId }
        : Object.keys(saved).length
          ? saved
          : fallback,
    );
    setSelection((current) =>
      current.weekday === next.weekday && current.timeSlotId === next.timeSlotId
        ? current
        : next,
    );
    if (!validSessionSelection(slots, next)) return;
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Optional browser preference. */
    }
    if (urlWeekday !== next.weekday || urlTimeSlotId !== next.timeSlotId)
      void navigate({
        to: "/grouping",
        replace: true,
        resetScroll: false,
        search: (previous) => ({ ...previous, ...next }),
      });
  }, [
    slots,
    storageKey,
    urlWeekday,
    urlTimeSlotId,
    navigate,
    fallback.weekday,
    fallback.timeSlotId,
  ]);

  function selectSession(requested: Partial<RegistrationSchedule>) {
    const next = chooseSession(slots, requested);
    setSelection(next);
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Optional browser preference. */
    }
    void navigate({
      to: "/grouping",
      replace: true,
      resetScroll: false,
      search: (previous) => ({ ...previous, ...next }),
    });
  }
  return { ...selection, selectSession };
}
