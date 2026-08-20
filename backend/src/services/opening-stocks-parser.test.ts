import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLegacyOpeningStockHtml } from "./opening-stocks.service.js";

function buildReport(detailRows: string): Buffer {
  return Buffer.from(
    `
    <html><body>
      <div class="nim-report-main-title">Consolidate Stock Report for the Period: 17/07/2026 and 19/08/2026</div>
      <table>
        <tr style="font-weight:bold"><td class="nim-report-section-header1">Corporate Store</td></tr>
        <tr style="font-weight:bold"><td class="nim-report-section-header2">PrintingItem</td></tr>
        <tr class="nim-report-thead-row">
          <th>SrNo</th><th>Item Name</th><th>Unit Name</th><th>Item Rate</th>
          <th>Opening Qty</th><th>Opening Amt</th><th>Purchase Qty</th><th>Purchase Amt</th>
          <th>Received Qty</th><th>Received Amt</th><th>Consumption Qty</th><th>Consumption Amt</th>
          <th>Transfer Qty</th><th>Transfer Amt</th><th>In Transit Qty</th><th>In Transit Amt</th>
          <th>Closing Stock Qty</th><th>Closing Total Amt</th>
        </tr>
        ${detailRows}
      </table>
    </body></html>
    `,
    "utf8",
  );
}

describe("parseLegacyOpeningStockHtml", () => {
  it("parses valid HTML-based XLS rows with headings", () => {
    const file = buildReport(`
      <tr>
        <td>1</td><td>Register Book</td><td>PCS</td><td>12.50</td>
        <td>10</td><td>125.00</td><td>5</td><td>62.50</td>
        <td>3</td><td>37.50</td><td>2</td><td>25.00</td>
        <td>1</td><td>12.50</td><td>-</td><td>-</td><td>15</td><td>187.50</td>
      </tr>
    `);

    const result = parseLegacyOpeningStockHtml(file);
    assert.equal(result.sourceReportFromDate, "2026-07-17");
    assert.equal(result.sourceReportToDate, "2026-08-19");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.legacyStoreName, "Corporate Store");
    assert.equal(result.rows[0]?.legacyCategoryName, "PrintingItem");
    assert.equal(result.rows[0]?.inTransitQuantity, "0");
  });

  it("parses thousands separators and decimals correctly", () => {
    const file = buildReport(`
      <tr>
        <td>1</td><td>Ledger Paper</td><td>REAM</td><td>1,250.2500</td>
        <td>1,000.5000</td><td>12,345.60</td><td>-</td><td>-</td>
        <td>-</td><td>-</td><td>0.5000</td><td>10.00</td>
        <td>-</td><td>-</td><td>-</td><td>-</td><td>1,000.0000</td><td>12,335.60</td>
      </tr>
    `);

    const result = parseLegacyOpeningStockHtml(file);
    assert.equal(result.rows[0]?.itemRate, "1250.25");
    assert.equal(result.rows[0]?.openingQuantity, "1000.5");
    assert.equal(result.rows[0]?.closingQuantity, "1000");
    assert.equal(result.rows[0]?.closingAmount, "12335.6");
  });

  it("preserves multiple rate layers for the same item", () => {
    const file = buildReport(`
      <tr>
        <td>1</td><td>Carbon Paper</td><td>BOX</td><td>100</td>
        <td>1</td><td>100</td><td>-</td><td>-</td><td>-</td><td>-</td>
        <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>1</td><td>100</td>
      </tr>
      <tr>
        <td>2</td><td>Carbon Paper</td><td>BOX</td><td>110</td>
        <td>2</td><td>220</td><td>-</td><td>-</td><td>-</td><td>-</td>
        <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>2</td><td>220</td>
      </tr>
    `);

    const result = parseLegacyOpeningStockHtml(file);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]?.itemRate, "100");
    assert.equal(result.rows[1]?.itemRate, "110");
  });

  it("keeps legacy Cartoon unit spelling as-is", () => {
    const file = buildReport(`
      <tr>
        <td>1</td><td>Form Pad</td><td>Cartoon</td><td>50</td>
        <td>1</td><td>50</td><td>-</td><td>-</td><td>-</td><td>-</td>
        <td>-</td><td>-</td><td>-</td><td>-</td><td>1</td><td>50</td><td>1</td><td>50</td>
      </tr>
    `);

    const result = parseLegacyOpeningStockHtml(file);
    assert.equal(result.rows[0]?.legacyUnitName, "Cartoon");
  });
});
