export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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
