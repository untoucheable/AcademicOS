import { CalendarEvent } from "./calendar";

export type EnergyLevel = "low" | "medium" | "high";

export type Mission = {
  id: string;

  createdAt: string;

  currentTime: string;

  energyLevel: EnergyLevel;

  focusScore: number;

  burnoutRisk: number;

  expectedFinishTime: string;

  summary: string;

  schedule: CalendarEvent[];
  reason?: string;
};

export function sortMissionSchedule<T extends { startTime: string; endTime?: string }>(
  schedule: T[] = []
) {
  function timeValue(value: string | undefined) {
    const time = value ? new Date(value).getTime() : Number.NaN;
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  }

  return [...schedule].sort((a, b) => {
    const startDifference = timeValue(a.startTime) - timeValue(b.startTime);

    if (startDifference !== 0) return startDifference;

    const endDifference =
      timeValue(a.endTime || a.startTime) - timeValue(b.endTime || b.startTime);

    if (endDifference !== 0) return endDifference;

    const titleA = ("title" in a ? String(a.title) : "").toLowerCase();
    const titleB = ("title" in b ? String(b.title) : "").toLowerCase();

    if (titleA !== titleB) return titleA.localeCompare(titleB);

    const idA = ("id" in a ? String(a.id) : "");
    const idB = ("id" in b ? String(b.id) : "");

    return idA.localeCompare(idB);
  });
}

export function sortMission(mission: Mission): Mission {
  return {
    ...mission,
    schedule: sortMissionSchedule(mission.schedule),
  };
}
