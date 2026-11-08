import type { Key } from "./en";
import { ruChrome } from "./ru_chrome";
import { ruPages1 } from "./ru_pages1";
import { ruPages2 } from "./ru_pages2";

// Typed as Record<Key, string>: the compiler fails if any English key is missing here.
export const ru: Record<Key, string> = { ...ruChrome, ...ruPages1, ...ruPages2 };
