export function isAbortError(error: unknown) {
  if (error == null || typeof error !== "object") return false;
  // DOMException in browsers; plain Error/{ name } in some runtimes / polyfills.
  return (error as { name?: string }).name === "AbortError";
}

/** Prevents aborted fetches from clearing loading state after a newer request starts. */
export function createLoadGuard() {
  let active = true;
  return {
    isActive: () => active,
    dispose: () => {
      active = false;
    },
  };
}
