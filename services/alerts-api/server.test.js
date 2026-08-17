import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
const { buildAlerts } = await import("./server.js");

test("includes expired products and category-specific alerts", () => {
  const alerts = buildAlerts([
    { id: "1", name: "Carne", category: "Açougue", expires_at: "2026-08-26", quantity: 1 },
    { id: "2", name: "Arroz", category: "Mercearia", expires_at: "2026-09-10", quantity: 1 },
    { id: "3", name: "Vencido", category: "Bazar", expires_at: "2026-08-15", quantity: 1 },
  ], "2026-08-16", 30);

  assert.deepEqual(alerts.map(({ id, daysUntilExpiry }) => [id, daysUntilExpiry]), [["3", -1], ["1", 10], ["2", 25]]);
});

test("does not alert butcher products more than 15 days ahead", () => {
  const alerts = buildAlerts([
    { id: "1", name: "Carne", category: "Açougue", expires_at: "2026-09-10", quantity: 1 },
  ], "2026-08-16", 30);

  assert.equal(alerts.length, 0);
});
