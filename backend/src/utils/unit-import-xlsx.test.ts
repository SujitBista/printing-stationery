import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseUnitImportWorkbook } from "../utils/unit-import-xlsx.js";

async function buildSampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Unit List");
  sheet.addRow(["Saptakoshi Development Bank Limited"]);
  sheet.addRow(["Biratnagar, Morang"]);
  sheet.addRow(["Unit List"]);
  sheet.addRow([]);
  sheet.addRow([null, "UnitID", "UnitName"]);
  sheet.addRow([null, 7, "BOX"]);
  sheet.addRow([null, 4, "Cartoon"]);
  sheet.addRow([null, 6, "PACKET"]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseUnitImportWorkbook", () => {
  it("parses UnitName from Unit List style workbooks", async () => {
    const buffer = await buildSampleWorkbook();
    const rows = await parseUnitImportWorkbook(buffer);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      rowNumber: 6,
      unitName: "BOX",
      isActive: true,
    });
    assert.deepEqual(rows[1], {
      rowNumber: 7,
      unitName: "Cartoon",
      isActive: true,
    });
    assert.deepEqual(rows[2], {
      rowNumber: 8,
      unitName: "PACKET",
      isActive: true,
    });
  });

  it("parses the provided Unit List.xlsx when present", async () => {
    let buffer: Buffer;
    try {
      buffer = readFileSync("/Users/sujitbista/Downloads/Unit List.xlsx");
    } catch {
      return;
    }

    const rows = await parseUnitImportWorkbook(buffer);
    assert.equal(rows.length, 7);
    assert.equal(rows[0]?.unitName, "BOX");
    assert.ok(rows.some((row) => row.unitName === "REAM"));
    assert.ok(rows.some((row) => row.unitName === "pkt"));
  });
});
