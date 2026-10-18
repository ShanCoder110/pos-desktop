/**
 * Branch for new stock / lot receive.
 * Prefer an explicit preferred id, then the cashier/session (current) branch —
 * same as POS — then shop main, then first active.
 */
export function resolveStockBranchId(
  branches: { id: string; isMain?: boolean }[],
  sessionBranchId?: string,
  preferredId?: string,
): string {
  if (preferredId && branches.some((branch) => branch.id === preferredId)) {
    return preferredId;
  }
  if (sessionBranchId && branches.some((branch) => branch.id === sessionBranchId)) {
    return sessionBranchId;
  }
  const main = branches.find((branch) => branch.isMain);
  if (main) return main.id;
  return branches[0]?.id ?? "";
}
