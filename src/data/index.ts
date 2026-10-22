// Typed access to the static JSON data files.

import type { Course, Offering, RequirementGroup } from "../solver/types";
import coursesJson from "./courses.json";
import requirementsJson from "./requirements.json";
import sectionsJson from "./sections.json";

export const courses = coursesJson as Course[];
export const requirements = requirementsJson as RequirementGroup[];
export const offerings = sectionsJson as Offering[];
