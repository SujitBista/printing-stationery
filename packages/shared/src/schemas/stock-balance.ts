import { z } from "zod";
import {
  nonNegativeMoneyStringSchema,
  nonNegativeQuantityStringSchema,
  rateStringSchema,
} from "./opening-stock.js";

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

export const stockBalanceListQuerySchema = z.object({
  storeId: optionalUuidFilterSchema,
  itemId: optionalUuidFilterSchema,
});

export const stockBalanceSchema = z.object({
  store: z.object({
    id: z.string().uuid(),
    storeCode: z.string(),
    storeName: z.string(),
  }),
  item: z.object({
    id: z.string().uuid(),
    itemCode: z.string(),
    itemName: z.string(),
  }),
  unit: z.object({
    id: z.string().uuid(),
    unitName: z.string(),
  }),
  rate: rateStringSchema,
  quantityIn: nonNegativeQuantityStringSchema,
  quantityOut: nonNegativeQuantityStringSchema,
  availableQuantity: nonNegativeQuantityStringSchema,
  amountIn: nonNegativeMoneyStringSchema,
  amountOut: nonNegativeMoneyStringSchema,
  availableAmount: nonNegativeMoneyStringSchema,
});

export const stockBalanceSummarySchema = z.object({
  storeId: z.string().uuid(),
  itemId: z.string().uuid(),
  unitId: z.string().uuid(),
  availableQuantity: nonNegativeQuantityStringSchema,
});

export const stockBalanceResponseSchema = z.object({
  balances: z.array(stockBalanceSchema),
  operationalSummaries: z.array(stockBalanceSummarySchema),
});
