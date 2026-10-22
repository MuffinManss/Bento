// Runs the solver off the main thread so the UI never freezes. The data is
// static, so the worker imports it itself; requests carry only student input.

import { courses, offerings, requirements } from "../data/index";
import { explainInfeasibility } from "../solver/explain";
import { generateSchedules } from "../solver/generate";
import type { SolveRequest, SolveResponse } from "./solverProtocol";

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { id, completed, filters, page } = event.data;
  let response: SolveResponse;
  try {
    const input = { courses, requirements, offerings, completed, filters };
    const result = generateSchedules(input, { page });
    // Only an empty first page needs explaining; later pages just ran out.
    const explanation = result.totalFound === 0 ? explainInfeasibility(input) : undefined;
    response = { id, ok: true, result, explanation };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};
