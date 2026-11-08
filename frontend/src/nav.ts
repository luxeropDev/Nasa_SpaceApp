import { useEffect, useState } from "react";

export const VIEWS = ["overview", "explorer", "assistant", "compare", "intel", "sources"] as const;
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
    const on = () => { setR(parse(window.location.hash)); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
