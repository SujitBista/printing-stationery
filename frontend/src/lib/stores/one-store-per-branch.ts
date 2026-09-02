export function getOccupiedBranchIds(
  stores: Array<{ id: string; branchId: string }>,
  currentStoreId?: string | null,
): Set<string> {
  const occupiedBranchIds = new Set<string>();
  for (const store of stores) {
    if (currentStoreId && store.id === currentStoreId) {
      continue;
    }
    occupiedBranchIds.add(store.branchId);
  }
  return occupiedBranchIds;
}
