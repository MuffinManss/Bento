// Display text for a requirement group's progress (see ../solver/progress.ts).

import type { GroupProgress } from "../solver/progress";
import { displayCode } from "./catalog";

/** ["MATH009A", "MATH009B", "MATH009C"] -> "MATH 009" */
function trackName(track: string[]): string {
  return displayCode(track[0]).replace(/[A-Z]+$/, "");
}

/** "2/6 courses", "1/1", "8/32 units", "MATH 009 track · 2/3", "Choose a track · 0/3" */
export function progressLabel(progress: GroupProgress): string {
  const fraction = `${progress.done}/${progress.needed}`;
  if (progress.unit === "courses") return `${fraction} courses`;
  if (progress.unit === "units") return `${fraction} units`;
  if (progress.unit === "track") return progress.track ? `${trackName(progress.track)} track · ${fraction}` : `Choose a track · ${fraction}`;
  return fraction;
}

/** The fraction alone, for "8/32 units → 16/32 with Option 1". */
export function progressFraction(progress: GroupProgress): string {
  return `${progress.done}/${progress.needed}`;
}
