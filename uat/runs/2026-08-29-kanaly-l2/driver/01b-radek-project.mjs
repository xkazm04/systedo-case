/** Radek, step 1 — the CATALOG-FIRST entry variant. A real `leadgen` project,
 *  no website scan: the plan must ground on the catalog spine + the localities
 *  `localitiesFor` gives every leadgen project. */
import { open, saveState, BASE } from "./lib.mjs";

const NAME = process.env.PROJECT_NAME ?? "Radek Poradenství";
const { browser, page } = await open();
try {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  const res = await page.request.post(`${BASE}/api/projects`, {
    data: { name: NAME, type: "leadgen" },
  });
  console.log("POST /api/projects →", res.status());
  const body = await res.json();
  const id = body.project?.id ?? body.id;
  console.log("radek projectId =", id);
  saveState({ radekProjectId: id, radekName: NAME });
} finally {
  await browser.close();
}
