/** The sample ad types itself out when Station 03 arrives, its gauges counting
 *  up to the real lengths (30/30, 89/90 in English). Only the text node React
 *  rendered is rewritten (nodeValue), so a later re-render still owns it. The
 *  final text is always what the server rendered. */
let timer = 0;

type Line = { node: Text; full: string; bar: HTMLElement | null; num: HTMLElement | null; max: number };

function lines(root: HTMLElement): Line[] {
  const ad = root.querySelector<HTMLElement>("[data-ob-ad]");
  if (!ad) return [];
  const texts = Array.from(ad.querySelectorAll<HTMLElement>("[data-ob-type]"));
  const gauges = Array.from(ad.querySelectorAll<HTMLElement>(".ob-gauge"));
  return texts.flatMap((el, i) => {
    const node = el.firstChild;
    if (!(node instanceof Text)) return [];
    const bar = gauges[i]?.querySelector<HTMLElement>(".ob-g-bar") ?? null;
    return [{ node, full: el.dataset.obType ?? node.nodeValue ?? "", bar, num: gauges[i]?.querySelector<HTMLElement>(".ob-g-num") ?? null, max: Number(bar?.dataset.max ?? 30) }];
  });
}

function show(l: Line, n: number) {
  l.node.nodeValue = l.full.slice(0, n);
  l.bar?.style.setProperty("--fill", Math.min(1, n / l.max).toFixed(3));
  if (l.num?.firstChild) l.num.firstChild.nodeValue = `${n}/${l.max}`;
}

export function finishAd(root: HTMLElement) {
  window.clearInterval(timer);
  lines(root).forEach((l) => show(l, l.full.length));
}

export function typeAd(root: HTMLElement) {
  window.clearInterval(timer);
  const ls = lines(root);
  if (ls.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finishAd(root);
  const [head, desc] = ls;
  let i = 0;
  let j = 0;
  show(head, 0);
  show(desc, 0);
  timer = window.setInterval(() => {
    if (i < head.full.length) show(head, ++i);
    else if (j < desc.full.length) show(desc, (j = Math.min(desc.full.length, j + 2)));
    else window.clearInterval(timer);
  }, 24);
}
