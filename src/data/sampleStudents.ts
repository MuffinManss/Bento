// Three representative CS B.S. students used to sanity-check the solver
// against the real data (see scripts/sample-students.ts and generate.test.ts).
// Completed lists follow the catalog's suggested 4-year plan for the MATH 009 track.

import type { Filters } from "../solver/types";

export type SampleStudent = { name: string; completed: string[]; filters: Filters };

const defaultFilters: Filters = { minUnits: 12, maxUnits: 16, daysOff: [], mustInclude: [], exclude: [] };

const freshmanFall = ["CS010A", "MATH009A", "ENGR001I"];
const firstYear = [...freshmanFall, "CS010B", "CS011", "CS061", "MATH009B", "MATH009C", "CS010C", "PHYS040A"];
const secondYear = [...firstYear, "CS100", "CS111", "CS120A", "CS105", "MATH010A", "MATH031", "PHYS040B", "PHYS040C"];

export const sampleStudents: SampleStudent[] = [
  // Only ~9 units of major courses are open to a first-quarter student; GE courses (not modeled) fill the rest.
  { name: "Incoming freshman, placed into MATH 009A (nothing completed yet), 8+ major units", completed: ["PLACE:MATH009A"], filters: { ...defaultFilters, minUnits: 8 } },
  { name: "Freshman after first quarter", completed: freshmanFall, filters: defaultFilters },
  { name: "2nd year (finished first year)", completed: firstYear, filters: defaultFilters },
  { name: "3rd year (finished second year), Fridays off, nothing before 9:00", completed: secondYear, filters: { ...defaultFilters, daysOff: ["F"], earliestStart: "09:00" } },
];
