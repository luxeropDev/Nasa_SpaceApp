import { useEffect, useState } from "react";

export const VIEWS = ["overview", "explorer", "compare", "assistant", "intel", "graph", "scenarios", "reports", "sources"] as const;
export type View = (typeof VIEWS)[number];
export type Route = { view: View; id: string | null; params: URLSearchParams };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [v, id] = path.split("/");
  const view = (VIEWS as readonly string[]).includes(v) ? (v as View) : "overview";
  return { view, id: id ? decodeURIComponent(id) : null, params: new URLSearchParams(query) };
}

export const href = (view: View, id?: string | null, params?: Record<string, string>) => {
  const q = params ? "?" + new URLSearchParams(params).toString() : "";
  return `#/${view}${id ? "/" + encodeURIComponent(id) : ""}${q}`;
};
export const go = (h: string) => { window.location.hash = h; };

export function useRoute(): Route {
  const [r, setR] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      const next = parse(window.location.hash);
      setR((prev) => {
        // only reset scroll when the page itself changes, not when a query param (filter/selection) changes
        if (prev.view !== next.view || prev.id !== next.id) window.scrollTo({ top: 0 });
        return next;
      });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
