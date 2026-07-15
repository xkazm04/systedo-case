/** Per-project finance-inputs store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped (the inputs belong to
 *  the project, not the user who entered them). Server-only. Mirrors annotations/store. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { FinanceInputs } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved finance inputs, or null when never entered. */
export async function getFinanceInputs(projectId: string): Promise<FinanceInputs | null> {
  return (await backend()).getFinanceInputs(projectId);
}

/** Replace the project's finance inputs blob. */
export async function saveFinanceInputs(projectId: string, inputs: FinanceInputs): Promise<void> {
  return (await backend()).saveFinanceInputs(projectId, inputs);
}

/** Drop a project's finance inputs. */
export async function clearFinanceInputs(projectId: string): Promise<void> {
  return (await backend()).clearFinanceInputs(projectId);
}
