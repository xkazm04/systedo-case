"use client";

import { useEffect } from "react";

/** Null-UI island that makes print / save-as-PDF actually contain the whole
 *  article: closed <details> content (FAQ answers, the author bio) does not
 *  print, so on `beforeprint` every collapsed disclosure on the page is opened
 *  and on `afterprint` the reader's previous open/closed state is restored.
 *  Pairs with the `print:hidden` utilities that strip the screen chrome. */
export default function PrintExpand() {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];

    const onBeforePrint = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")];
      for (const el of opened) el.open = true;
    };
    const onAfterPrint = () => {
      for (const el of opened) el.open = false;
      opened = [];
    };

    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  return null;
}
