import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

const request = (id) => new Request(`https://sokna.example/admin/reservations/export?gigId=${id}`);
const reservation = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "00123",
  buyer_name: "=1+1",
  depositor: "입금자",
  phone: "01012345678",
  quantity: 2,
  total_amount: 24000,
  admitted_quantity: 1,
  status: "approved",
  refund_status: "none",
  cancellation_requested_at: null,
  payment_reported_at: null,
  paid_amount: 24000,
  created_at: "2026-11-08T15:30:00.123456+00:00",
};

function fixture({ admin = true, gig = { title: "공연 / 1" }, pages = [] } = {}) {
  const calls = [], books = [];
  const { GET } = loadTs("app/admin/reservations/export/route.ts", {
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/lib/ticket-server": {
      ticketClient: async () => ({
        from(table) {
          calls.push(["from", table]);
          const query = {
            select: () => query,
            eq: (...args) => { calls.push(["eq", ...args]); return query; },
            order: (...args) => { calls.push(["order", ...args]); return query; },
            limit: (limit) => { calls.push(["limit", limit]); return query; },
            or: (filter) => { calls.push(["or", filter]); return query; },
            maybeSingle: async () => ({ data: gig, error: null }),
            then: (resolve, reject) => Promise.resolve(pages.shift()).then(resolve, reject),
          };
          return query;
        },
      }),
    },
    "write-excel-file/node": (sheet, options) => {
      books.push({ sheet, options });
      return { toBuffer: async () => Buffer.from("workbook") };
    },
  });
  return { GET, calls, books };
}

test("reservation download rejects unauthorized and invalid requests before reading records", async () => {
  const visitor = fixture({ admin: false });
  const forbidden = await visitor.GET(request(7));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(visitor.calls, []);

  const invalid = fixture();
  for (const value of ["", "0", "-1", "0x7", "9007199254740992"]) {
    assert.equal((await invalid.GET(request(value))).status, 400);
  }
  assert.deepEqual(invalid.calls, []);
});

test("reservation download exports every page for one gig, preserving text and Korean time", async () => {
  const first = Array.from({ length: 500 }, () => reservation);
  const last = { ...reservation, id: "10000000-0000-4000-8000-000000000002", code: "last", status: "cancelled" };
  const { GET, calls, books } = fixture({ pages: [{ data: first }, { data: [last] }] });
  const response = await GET(request(7));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-type"), /spreadsheetml.sheet/);
  assert.match(decodeURIComponent(response.headers.get("content-disposition")), /공연 1 - 예매자 목록\.xlsx/);
  assert.equal(await response.text(), "workbook");
  assert.deepEqual(calls.filter(([operation, field]) => operation === "eq" && field === "gig_id"), [
    ["eq", "gig_id", 7], ["eq", "gig_id", 7],
  ]);
  assert.deepEqual(calls.filter(([operation]) => operation === "or"), [[
    "or", `created_at.lt.${reservation.created_at},and(created_at.eq.${reservation.created_at},id.lt.${reservation.id})`,
  ]]);
  const { sheet, options } = books[0];
  assert.equal(sheet.length, 502);
  assert.equal(options.stickyRowsCount, 1);
  assert.deepEqual(sheet[1].slice(0, 4), [
    { value: "00123", type: String, format: "@" },
    { value: "=1+1", type: String },
    { value: "입금자", type: String },
    { value: "010-1234-5678", type: String, format: "@" },
  ]);
  assert.equal(sheet[1][8].value.toISOString(), "2026-11-09T00:30:00.123Z");
  assert.equal(sheet.at(-1)[7], "예매 취소");
});

test("a missing gig and a failed later page never produce a workbook", async () => {
  const missing = fixture({ gig: null });
  assert.equal((await missing.GET(request(7))).status, 404);
  assert.equal(missing.books.length, 0);

  const failed = fixture({ pages: [{ data: Array.from({ length: 500 }, () => reservation) }, { error: true }] });
  const response = await failed.GET(request(7));
  assert.equal(response.status, 500);
  assert.doesNotMatch(response.headers.get("content-type"), /spreadsheetml.sheet/);
  assert.equal(failed.books.length, 0);
});
