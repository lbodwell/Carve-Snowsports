export type TimeRange = {
  startsAt: string;
  endsAt: string;
};

function toMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) throw new Error(`Invalid local time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function rangesOverlap(left: TimeRange, right: TimeRange) {
  const leftStart = toMinutes(left.startsAt);
  const leftEnd = toMinutes(left.endsAt);
  const rightStart = toMinutes(right.startsAt);
  const rightEnd = toMinutes(right.endsAt);

  if (leftEnd <= leftStart || rightEnd <= rightStart) {
    throw new Error("A time range must end after it starts.");
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}
