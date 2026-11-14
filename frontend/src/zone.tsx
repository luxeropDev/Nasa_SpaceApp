import { createContext } from "react";
import type { ReactNode } from "react";

/** True inside a <DarkZone>: lets charts pick the dark palette even when the global theme is light. */
export const DarkZoneCtx = createContext(false);

/**
 * Hybrid theme: analysis and media surfaces (assistant, evidence graph, mission visualisation) always render on a
 * dark plotting surface; reading and catalog surfaces follow the user's theme. `.zone-dark` re-declares the dark
 * design tokens locally, so every component inside works unchanged.
 */
export function DarkZone({ children, className = "", as: Tag = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "section" | "aside"; id?: string; "aria-labelledby"?: string }) {
  return (
    <DarkZoneCtx.Provider value={true}>
      <Tag className={`zone-dark ${className}`} {...rest}>{children}</Tag>
    </DarkZoneCtx.Provider>
  );
}
