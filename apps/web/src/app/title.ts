import { useEffect } from "react";

const BASE = "Community Bots";
let page = BASE;
let badge = 0;

function render() {
  document.title = `${badge > 0 ? `(${badge}) ` : ""}${page}`;
}

/** Number of things waiting on the user, shown as "(2) …" in the tab title. */
export function setTitleBadge(count: number) {
  if (count === badge) return;
  badge = count;
  render();
}

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    page = title ? `${title} · ${BASE}` : BASE;
    render();
    return () => {
      page = BASE;
      render();
    };
  }, [title]);
}
