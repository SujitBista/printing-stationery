import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL,
  UNKNOWN_LEGACY_SOURCE_LABEL,
} from "@printing-stationery/shared";
import {
  buildLegacyOpeningInTransitLedgerValue,
  buildLegacyOpeningInTransitReceiptLedgerValues,
  classifyOpeningStockInTransitBackfill,
  LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS,
  legacyOpeningInTransitSourceKey,
} from "./opening-stock-in-transit.js";

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const STORE_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";
const BATCH_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

describe("legacy opening in-transit posting helpers", () => {
  it("posts 20 available and 5 imported in transit as separate categories", () => {
    const availableQuantity = "20";
    const inTransit = buildLegacyOpeningInTransitLedgerValue({
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      rate: "10",
      quantityIn: "5",
      amountIn: "50",
      transactionDate: new Date("2026-09-18T00:00:00.000Z"),
      batchId: BATCH_ID,
      lineId: LINE_ID,
      postedByApplicationUserId: USER_ID,
      postedAt: new Date("2026-09-18T00:00:00.000Z"),
    });

    assert.equal(availableQuantity, "20");
    assert.equal(inTransit.stockCategory, "IN_TRANSIT");
    assert.equal(inTransit.quantityIn, "5");
    assert.equal(inTransit.quantityOut, "0");
    assert.equal(inTransit.storeId, STORE_ID);
    assert.equal(inTransit.itemId, ITEM_ID);
    assert.equal(inTransit.unitId, UNIT_ID);
    assert.equal(inTransit.referenceType, "LEGACY_OPENING_IN_TRANSIT");
    assert.equal(inTransit.movementType, "LEGACY_OPENING_IN_TRANSIT");
    assert.equal(inTransit.referenceId, BATCH_ID);
    assert.equal(inTransit.referenceLineId, LINE_ID);
    assert.equal(
      inTransit.sourceKey,
      legacyOpeningInTransitSourceKey({
        openingStockLineId: LINE_ID,
        storeId: STORE_ID,
        rate: "10",
      }),
    );
    assert.equal(
      inTransit.sourceKey.startsWith("LEGACY_OPENING_IN_TRANSIT:"),
      true,
    );
  });

  it("does not add imported in-transit quantity to AVAILABLE", () => {
    const inTransit = buildLegacyOpeningInTransitLedgerValue({
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      rate: "10",
      quantityIn: "5",
      amountIn: "50",
      transactionDate: new Date("2026-09-18T00:00:00.000Z"),
      batchId: BATCH_ID,
      lineId: LINE_ID,
      postedByApplicationUserId: USER_ID,
      postedAt: new Date("2026-09-18T00:00:00.000Z"),
    });
    assert.notEqual(inTransit.stockCategory, "AVAILABLE");
    assert.notEqual(inTransit.movementType, "OPENING_STOCK");
  });

  it("creates no ledger entry for zero or missing imported in-transit quantity", () => {
    assert.equal(
      classifyOpeningStockInTransitBackfill({
        sourceInTransitQuantity: "0",
        storeId: STORE_ID,
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        mappingStatus: "MAPPED",
        expectedSourceKey: "unused",
        existingInTransitEntries: [],
      }).action,
      "NONE",
    );
    assert.equal(
      classifyOpeningStockInTransitBackfill({
        sourceInTransitQuantity: null,
        storeId: STORE_ID,
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        mappingStatus: "MAPPED",
        expectedSourceKey: "unused",
        existingInTransitEntries: [],
      }).action,
      "NONE",
    );
    assert.equal(
      classifyOpeningStockInTransitBackfill({
        sourceInTransitQuantity: "",
        storeId: STORE_ID,
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        mappingStatus: "MAPPED",
        expectedSourceKey: "unused",
        existingInTransitEntries: [],
      }).action,
      "NONE",
    );
  });

  it("preserves unknown legacy source without inventing a store", () => {
    const inTransit = buildLegacyOpeningInTransitLedgerValue({
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      rate: "10",
      quantityIn: "5",
      amountIn: "50",
      transactionDate: new Date("2026-09-18T00:00:00.000Z"),
      batchId: BATCH_ID,
      lineId: LINE_ID,
      postedByApplicationUserId: USER_ID,
      postedAt: new Date("2026-09-18T00:00:00.000Z"),
    });
    assert.equal("sourceStoreId" in inTransit, false);
    assert.equal(inTransit.storeId, STORE_ID);
    assert.equal(LEGACY_OPENING_IN_TRANSIT_SOURCE_LABEL, "Legacy Opening In Transit");
    assert.equal(UNKNOWN_LEGACY_SOURCE_LABEL, "Unknown legacy source");
  });

  it("uses a deterministic unique source_key", () => {
    const first = legacyOpeningInTransitSourceKey({
      openingStockLineId: LINE_ID,
      storeId: STORE_ID,
      rate: "12.5",
    });
    const second = legacyOpeningInTransitSourceKey({
      openingStockLineId: LINE_ID,
      storeId: STORE_ID,
      rate: "12.5",
    });
    assert.equal(first, second);
    assert.match(
      first,
      /^LEGACY_OPENING_IN_TRANSIT:[0-9a-f-]+:[0-9a-f-]+:LEGACY_OPENING_IN_TRANSIT:IN_TRANSIT:12\.5$/,
    );
  });

  it("marks incomplete historical in-transit data for Admin review", () => {
    const decision = classifyOpeningStockInTransitBackfill({
      sourceInTransitQuantity: "5",
      storeId: null,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      mappingStatus: "UNMAPPED_STORE",
      expectedSourceKey: "unused",
      existingInTransitEntries: [],
    });
    assert.deepEqual(decision, {
      action: "REVIEW",
      reason: LEGACY_OPENING_IN_TRANSIT_REVIEW_REASONS.INCOMPLETE_MAPPING,
    });
  });

  it("skips already backfilled in-transit rows and does not recreate AVAILABLE entries", () => {
    const sourceKey = legacyOpeningInTransitSourceKey({
      openingStockLineId: LINE_ID,
      storeId: STORE_ID,
      rate: "10",
    });
    const decision = classifyOpeningStockInTransitBackfill({
      sourceInTransitQuantity: "5",
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      mappingStatus: "MAPPED",
      expectedSourceKey: sourceKey,
      existingInTransitEntries: [
        { sourceKey, quantityIn: "5", quantityOut: "0" },
      ],
    });
    assert.equal(decision.action, "SKIP_EXISTING");
  });

  it("does not duplicate when existing in-transit source_key already matches", () => {
    const sourceKey = legacyOpeningInTransitSourceKey({
      openingStockLineId: LINE_ID,
      storeId: STORE_ID,
      rate: "10",
    });
    const first = classifyOpeningStockInTransitBackfill({
      sourceInTransitQuantity: "5",
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      mappingStatus: "MAPPED",
      expectedSourceKey: sourceKey,
      existingInTransitEntries: [],
    });
    const second = classifyOpeningStockInTransitBackfill({
      sourceInTransitQuantity: "5",
      storeId: STORE_ID,
      itemId: ITEM_ID,
      unitId: UNIT_ID,
      mappingStatus: "MAPPED",
      expectedSourceKey: sourceKey,
      existingInTransitEntries: [
        { sourceKey, quantityIn: "5", quantityOut: "0" },
      ],
    });
    assert.equal(first.action, "INSERT");
    assert.equal(second.action, "SKIP_EXISTING");
  });

  it("builds receipt movements that decrease IN_TRANSIT and increase AVAILABLE", () => {
    const [availableIn, inTransitOut] =
      buildLegacyOpeningInTransitReceiptLedgerValues({
        storeId: STORE_ID,
        itemId: ITEM_ID,
        unitId: UNIT_ID,
        rate: "10",
        quantity: "5",
        amount: "50",
        transactionDate: new Date("2026-09-18T00:00:00.000Z"),
        batchId: BATCH_ID,
        lineId: LINE_ID,
        postedByApplicationUserId: USER_ID,
        postedAt: new Date("2026-09-18T00:00:00.000Z"),
      });
    assert.equal(availableIn?.stockCategory, "AVAILABLE");
    assert.equal(availableIn?.quantityIn, "5");
    assert.equal(availableIn?.quantityOut, "0");
    assert.equal(inTransitOut?.stockCategory, "IN_TRANSIT");
    assert.equal(inTransitOut?.quantityIn, "0");
    assert.equal(inTransitOut?.quantityOut, "5");
    assert.notEqual(availableIn?.sourceKey, inTransitOut?.sourceKey);
  });
});
