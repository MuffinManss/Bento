// React hook around the solver worker: debounces input changes, ignores
// stale responses, and exposes a loading flag.

import { useEffect, useRef, useState } from "react";
import type { Explanation } from "../solver/explain";
import type { GenerateResult } from "../solver/generate";
import type { Filters } from "../solver/types";
import type { SolveRequest, SolveResponse } from "./solverProtocol";

export type SolverState = {
  loading: boolean;
  result?: GenerateResult;
  explanation?: Explanation;
  error?: string;
};

const DEBOUNCE_MS = 250;

/** Solves for (completed, metGroups, filters, page) whenever they change; `enabled: false` skips the request (e.g. invalid input). */
export function useSolver(completed: string[], metGroups: string[], filters: Filters, page: number, enabled: boolean): SolverState {
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);
  const [state, setState] = useState<SolverState>({ loading: false });

  useEffect(() => {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SolveResponse>) => {
      const response = event.data;
      if (response.id !== latestId.current) return; // a newer request is in flight
      setState(response.ok ? { loading: false, result: response.result, explanation: response.explanation } : { loading: false, error: response.error });
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const key = JSON.stringify({ completed, metGroups, filters, page });
  useEffect(() => {
    if (!enabled) return;
    setState((previous) => ({ ...previous, loading: true }));
    const timer = window.setTimeout(() => {
      latestId.current += 1;
      const request: SolveRequest = { id: latestId.current, completed, metGroups, filters, page };
      workerRef.current?.postMessage(request);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `key` captures every input by value; the objects themselves change identity each render.
  }, [key, enabled]);

  return state;
}
