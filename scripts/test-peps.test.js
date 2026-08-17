// Teste da regra PEPS (espelha a função SQL baixar_estoque) e reposição.
// Roda sem banco: valida a lógica de baixa por lote.
import assert from "node:assert/strict";
import test from "node:test";

// Lógica pura: baixa qtd do lote que vence primeiro, ignora vencidos.
function baixarPeps(lotes, quantidade, hoje = "2026-08-17") {
  const disponiveis = lotes
    .filter((l) => l.quantity > 0 && l.expires_at >= hoje)
    .sort((a, b) =>
      a.expires_at.localeCompare(b.expires_at) ||
      a.received_at.localeCompare(b.received_at)
    );
  const total = disponiveis.reduce((s, l) => s + l.quantity, 0);
  if (total < quantidade) throw new Error(`Estoque insuficiente: ${total}`);

  let restante = quantidade;
  for (const lote of disponiveis) {
    if (restante <= 0) break;
    const sai = Math.min(restante, lote.quantity);
    lote.quantity -= sai;
    restante -= sai;
  }
  return { totalBaixado: quantidade - restante, lotes };
}

test("baixa do lote que vence primeiro (PEPS)", () => {
  const lotes = [
    { id: "A", expires_at: "2026-08-20", received_at: "2026-08-01", quantity: 5 },
    { id: "B", expires_at: "2026-09-05", received_at: "2026-08-10", quantity: 3 },
  ];
  const { totalBaixado, lotes: out } = baixarPeps(lotes, 6);
  assert.equal(totalBaixado, 6);
  assert.equal(out.find((l) => l.id === "A").quantity, 0);
  assert.equal(out.find((l) => l.id === "B").quantity, 2);
});

test("esgota lote 1 e continua no lote 2", () => {
  const lotes = [
    { id: "A", expires_at: "2026-08-20", received_at: "2026-08-01", quantity: 2 },
    { id: "B", expires_at: "2026-09-05", received_at: "2026-08-10", quantity: 3 },
  ];
  const out = baixarPeps(lotes, 4).lotes;
  assert.equal(out.find((l) => l.id === "A").quantity, 0);
  assert.equal(out.find((l) => l.id === "B").quantity, 1);
});

test("bloqueia venda de lote vencido", () => {
  const lotes = [
    { id: "VENCIDO", expires_at: "2026-08-10", received_at: "2026-07-01", quantity: 5 },
    { id: "OK", expires_at: "2026-09-01", received_at: "2026-08-10", quantity: 3 },
  ];
  const out = baixarPeps(lotes, 2).lotes;
  assert.equal(out.find((l) => l.id === "VENCIDO").quantity, 5); // não sai
  assert.equal(out.find((l) => l.id === "OK").quantity, 1); // sai do válido
});

test("lança erro quando estoque insuficiente", () => {
  const lotes = [
    { id: "A", expires_at: "2026-08-20", received_at: "2026-08-01", quantity: 2 },
  ];
  assert.throws(() => baixarPeps(lotes, 3), /Estoque insuficiente/);
});

// Reposição: novo lote entra ao final da fila PEPS (não altera o antigo).
test("reposição cria novo lote que só sai após o existente", () => {
  const lotes = [
    { id: "A", expires_at: "2026-08-20", received_at: "2026-08-01", quantity: 2 },
  ];
  // simula repor: adiciona lote B com validade posterior
  lotes.push({ id: "B", expires_at: "2026-09-10", received_at: "2026-08-17", quantity: 5 });
  const out = baixarPeps(lotes, 2).lotes;
  // sai primeiro do A (vence antes), B intocado
  assert.equal(out.find((l) => l.id === "A").quantity, 0);
  assert.equal(out.find((l) => l.id === "B").quantity, 5);
});
