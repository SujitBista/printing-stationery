import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemRequestStoreSummary } from "@printing-stationery/shared";
import {
  ELIGIBLE_SOURCE_STORE_PAGE_SIZE,
  eligibleSourceStoreSearchHasMore,
  mergeEligibleSourceStorePages,
} from "./item-request-store-search.js";

function store(id: string, name: string): ItemRequestStoreSummary {
  return {
    id,
    storeCode: id.slice(0, 8).toUpperCase(),
    storeName: name,
    isActive: true,
    branch: {
      id: `branch-${id}`,
      branchCode: "BR",
      branchName: `${name} Branch`,
      branchType: "BRANCH",
      isActive: true,
    },
  };
}

describe("eligible source store search", () => {
  it("does not use a first-page size of five", () => {
    assert.ok(ELIGIBLE_SOURCE_STORE_PAGE_SIZE > 5);
  });

  it("can search and select a store beyond the first five results", () => {
    const firstFive = [
      store("11111111-1111-4111-8111-111111111111", "Alpha"),
      store("22222222-2222-4222-8222-222222222222", "Bravo"),
      store("33333333-3333-4333-8333-333333333333", "Charlie"),
      store("44444444-4444-4444-8444-444444444444", "Delta"),
      store("55555555-5555-4555-8555-555555555555", "Echo"),
    ];
    const sixth = store(
      "66666666-6666-4666-8666-666666666666",
      "Zulu Distant",
    );

    assert.equal(firstFive.length, 5);
    assert.ok(!firstFive.some((item) => item.id === sixth.id));

    const afterSearch = mergeEligibleSourceStorePages({
      current: firstFive,
      incoming: [sixth],
      page: 1,
    });
    assert.equal(afterSearch.length, 1);
    assert.equal(afterSearch[0]?.id, sixth.id);

    const afterScroll = mergeEligibleSourceStorePages({
      current: firstFive,
      incoming: [sixth],
      page: 2,
    });
    assert.equal(afterScroll.length, 6);
    assert.ok(afterScroll.some((item) => item.id === sixth.id));
    assert.equal(
      eligibleSourceStoreSearchHasMore({ page: 1, totalPages: 3 }),
      true,
    );
  });
});
