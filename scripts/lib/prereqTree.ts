import type { Prereq } from "../../src/solver/types.ts";

export function collectLeafCourses(tree: Prereq, out: Set<string> = new Set()): Set<string> {
  if ("course" in tree) {
    out.add(tree.course);
  } else if ("pick" in tree) {
    for (const child of tree.of) collectLeafCourses(child, out);
  } else if ("and" in tree) {
    for (const child of tree.and) collectLeafCourses(child, out);
  } else {
    for (const child of tree.or) collectLeafCourses(child, out);
  }
  return out;
}
