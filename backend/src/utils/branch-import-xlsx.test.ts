import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseBranchImportWorkbook } from "../utils/branch-import-xlsx.js";

async function buildSampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("storemaster");
  sheet.addRow(["Saptakoshi Development Bank Limited"]);
  sheet.addRow(["Biratnagar, Morang"]);
  sheet.addRow([]);
  sheet.addRow(["storemaster"]);
  sheet.addRow([
    null,
    "BranchName",
    "UnderStoreName",
    "BusinessUnitName",
    "StoreID",
    "StoreCode",
    "StoreName",
    "BranchID",
    "UnderStore",
    "AddedBy",
    "AddedOn",
    "ResponsibleEmpCode",
    "BusinessUnitID",
    "RequestInterval",
    "IsActive",
  ]);
  sheet.addRow([null, "Corporate Office", null, null, 1, "999", "Corporate Store", null, null, null, null, null, null, 0, true]);
  sheet.addRow([null, "Tankisinwari Branch", "Corporate Store", null, 2, "001", "Tanki Store", null, null, null, null, null, null, 0, true]);
  sheet.addRow([null, "-", "Corporate Store", null, 38, "0999", "Corporate Main Branch 999", null, null, null, null, null, null, 0, true]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseBranchImportWorkbook", () => {
  it("parses branch names and uses store code as branch code", async () => {
    const buffer = await buildSampleWorkbook();
    const rows = await parseBranchImportWorkbook(buffer);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      rowNumber: 6,
      branchCode: "999",
      branchName: "Corporate Office",
      underStoreName: undefined,
      isActive: true,
    });
    assert.deepEqual(rows[1], {
      rowNumber: 7,
      branchCode: "001",
      branchName: "Tankisinwari Branch",
      underStoreName: "Corporate Store",
      isActive: true,
    });
    assert.deepEqual(rows[2], {
      rowNumber: 8,
      branchCode: "0999",
      branchName: "-",
      underStoreName: "Corporate Store",
      isActive: true,
    });
  });

  it("parses the provided storemaster.xlsx when present", async () => {
    let buffer: Buffer;
    try {
      buffer = readFileSync("/Users/sujitbista/Downloads/storemaster.xlsx");
    } catch {
      return;
    }

    const rows = await parseBranchImportWorkbook(buffer);
    assert.equal(rows.length, 37);
    assert.equal(rows[0]?.branchCode, "999");
    assert.equal(rows[0]?.branchName, "Corporate Office");
    assert.ok(rows.some((row) => row.branchName === "Basantapur Branch"));
    const placeholderRow = rows.find((row) => row.branchCode === "0999");
    assert.equal(placeholderRow?.branchName, "-");
  });
});
