// Messages between the UI and the solver Web Worker (./solver.worker.ts).

import type { Explanation } from "../solver/explain";
import type { GenerateResult } from "../solver/generate";
import type { Filters } from "../solver/types";

export type SolveRequest = { id: number; completed: string[]; filters: Filters; page: number };

export type SolveResponse =
  | { id: number; ok: true; result: GenerateResult; explanation?: Explanation }
  | { id: number; ok: false; error: string };
