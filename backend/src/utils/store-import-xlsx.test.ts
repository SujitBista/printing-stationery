import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseStoreImportWorkbook } from "../utils/store-import-xlsx.js";

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
    "AllowTransfer",
    "IsControlBUID",
    "IsAllowDepartment",
    "IsProvinceStore",
    "IsMainStore",
  ]);
  sheet.addRow([
    null,
    "Corporate Office",
    null,
    null,
    1,
    "999",
    "Corporate Store",
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    true,
    true,
    false,
    true,
    false,
    false,
  ]);
  sheet.addRow([
    null,
    "Tankisinwari Branch",
    "Corporate Store",
    null,
    2,
    "001",
    "Tanki Store",
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
  sheet.addRow([
    null,
    "-",
    "Corporate Store",
    null,
    3,
    "0999",
    "Corporate Main Branch 999",
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseStoreImportWorkbook", () => {
  it("parses storemaster-style workbooks", async () => {
    const buffer = await buildSampleWorkbook();
    const rows = await parseStoreImportWorkbook(buffer);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      rowNumber: 6,
      storeCode: "999",
      storeName: "Corporate Store",
      branchName: "Corporate Office",
      underStoreName: "",
      allowTransfer: true,
      allowDepartmentIssue: true,
      isActive: true,
    });
    assert.deepEqual(rows[1], {
      rowNumber: 7,
      storeCode: "001",
      storeName: "Tanki Store",
      branchName: "Tankisinwari Branch",
      underStoreName: "Corporate Store",
      allowTransfer: false,
      allowDepartmentIssue: false,
      isActive: true,
    });
    assert.equal(rows[2]?.branchName, "-");
    assert.equal(rows[2]?.underStoreName, "Corporate Store");
  });

  it("parses the real storemaster.xlsx when available", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const path = "/Users/sujitbista/Downloads/storemaster.xlsx";
    if (!existsSync(path)) {
      return;
    }

    const rows = await parseStoreImportWorkbook(readFileSync(path));
    assert.equal(rows.length, 37);
    assert.equal(rows[0]?.storeCode, "999");
    assert.equal(rows[0]?.storeName, "Corporate Store");
    assert.equal(rows[0]?.underStoreName, "");
    assert.equal(rows[1]?.underStoreName, "Corporate Store");
  });
});
