import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseItemImportWorkbook } from "../utils/item-import-xlsx.js";

async function buildSampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Item Master");
  sheet.addRow(["Saptakoshi Development Bank Limited"]);
  sheet.addRow(["Biratnagar, Morang"]);
  sheet.addRow([]);
  sheet.addRow(["Item Master"]);
  sheet.addRow([
    null,
    "ItemCode",
    "ItemName",
    "UnitName",
    "GroupName",
    "RefundTypeName",
    "PurchaseRate",
    "IsActive",
    "ActiveRequest",
    "InActiveRequest",
    "ActiveIssue",
    "IsTrackSrNo",
    "GroupTypeName",
    "Remarks",
  ]);
  sheet.addRow([
    null,
    "110",
    "Nepali Paper A3",
    "PAD",
    "StationeryItem",
    "Non Refundable",
    0,
    true,
    true,
    false,
    true,
    false,
    "Inventory",
    "",
  ]);
  sheet.addRow([
    null,
    "109",
    "ATM FORM",
    "PAD",
    "PrintingItem",
    "Non Refundable",
    101.7,
    true,
    true,
    false,
    true,
    false,
    "Inventory",
    "Sample",
  ]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseItemImportWorkbook", () => {
  it("parses Item Master style workbooks", async () => {
    const buffer = await buildSampleWorkbook();
    const rows = await parseItemImportWorkbook(buffer);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      rowNumber: 6,
      itemCode: "110",
      itemName: "Nepali Paper A3",
      unitName: "PAD",
      groupName: "StationeryItem",
      refundTypeName: "Non Refundable",
      purchaseRate: "0",
      remarks: "",
      isActive: true,
      isRequestable: true,
      isIssuable: true,
      trackSerialNumber: false,
    });
    assert.equal(rows[1]?.itemCode, "109");
    assert.equal(rows[1]?.purchaseRate, "101.7");
    assert.equal(rows[1]?.remarks, "Sample");
  });

  it("parses the provided Item Master workbook when present", async () => {
    let buffer: Buffer;
    try {
      buffer = readFileSync("/Users/sujitbista/Downloads/Item Master (1).xlsx");
    } catch {
      return;
    }

    const rows = await parseItemImportWorkbook(buffer);
    assert.equal(rows.length, 110);
    assert.equal(rows[0]?.itemCode, "110");
    assert.ok(rows.some((row) => row.itemName === "ATM FORM"));
    assert.ok(rows.some((row) => row.unitName === "" && row.itemCode === "94"));
  });
});
