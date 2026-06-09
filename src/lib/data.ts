import dataset from "@/data/performance.json";
import type { PerformanceData } from "./types";

/** The single JSON file is our "database". Imported statically so it is typed,
 *  tree-shaken and bundled — works identically in dev and on Vercel. Regenerate
 *  with `npm run seed`. */
export const performance = dataset as PerformanceData;
