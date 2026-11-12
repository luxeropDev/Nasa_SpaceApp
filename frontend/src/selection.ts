import { useSyncExternalStore } from "react";
import { MAX_COMPARE } from "./api";

/** Research "workbench" selection shared by Explorer, detail pages, Compare and Reports (persisted per tab). */
const KEY = "flamewise.selection";
let ids: string[] = (() => {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX_COMPARE) : []; } catch { return []; }
})();
const subs = new Set<() => void>();
const emit = () => { try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* optional */ } subs.forEach((f) => f()); };

export const selection = {
  toggle(id: string): boolean {
    if (ids.includes(id)) { ids = ids.filter((x) => x !== id); emit(); return true; }
    if (ids.length >= MAX_COMPARE) return false;
    ids = [...ids, id]; emit(); return true;
  },
  clear() { ids = []; emit(); },
};

export function useSelection(): string[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ids);
}
