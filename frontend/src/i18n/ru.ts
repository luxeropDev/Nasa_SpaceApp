import type { Key } from "./en";
import { ruChrome } from "./ru_chrome";
import { ruPages1 } from "./ru_pages1";
import { ruPages2 } from "./ru_pages2";
import { ruV2 } from "./ru_v2";
import { ruV3 } from "./ru_v3";
import { ruV4 } from "./ru_v4";

// Typed as Record<Key, string>: the compiler fails if any English key is missing here.
export const ru: Record<Key, string> = { ...ruChrome, ...ruPages1, ...ruPages2, ...ruV2, ...ruV3, ...ruV4 };
