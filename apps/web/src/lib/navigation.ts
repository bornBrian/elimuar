"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { startNavigation } from "@/components/NavProgress";

/** Next's router, but push and replace start the top progress bar first, so a button that navigates gives
   feedback the moment it is pressed. */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        startNavigation();
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        startNavigation();
        router.replace(...args);
      },
    }),
    [router]
  );
}
