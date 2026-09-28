import test from "node:test";
import assert from "node:assert/strict";
import { planGigPerformerChanges } from "../lib/gig-performer-reconcile.ts";

const stored = (id, userId, name, part = "기타") => ({
  id,
  user_id: userId,
  name,
  part,
  photo_url: null,
});

test("linking a renamed dummy updates its original row", () => {
  const plan = planGigPerformerChanges(
    12,
    [{ performerId: 7, id: "member-1", name: "회원 이름", part: "기타" }],
    [stored(7, null, "임시 이름")]
  );

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.toInsert, []);
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.toUpdate, [{
    id: 7,
    user_id: "member-1",
    name: "회원 이름",
    part: "기타",
    photo_url: null,
  }]);
});

test("linking to an already listed member keeps one row and transfers authorship", () => {
  const plan = planGigPerformerChanges(
    12,
    [{ performerId: 7, id: "member-1", name: "회원 이름", part: "기타, 보컬" }],
    [stored(7, null, "임시 이름"), stored(8, "member-1", "회원 이름", "보컬")]
  );

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.toInsert, []);
  assert.deepEqual(plan.toDelete, [{ id: 8, replacementId: 7 }]);
  assert.equal(plan.toUpdate[0].id, 7);
});

test("directly entered dummy is inserted without a member account", () => {
  const plan = planGigPerformerChanges(
    12,
    [{ name: "새 공연자", email: "temp-local", part: "드럼" }],
    []
  );

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.toInsert, [{
    gig_id: 12,
    user_id: null,
    name: "새 공연자",
    part: "드럼",
    photo_url: null,
  }]);
});

test("stale row IDs and duplicate member links are rejected", () => {
  const stale = planGigPerformerChanges(
    12,
    [{ performerId: 99, id: "member-1", name: "회원 이름" }],
    [stored(7, null, "임시 이름")]
  );
  assert.equal(stale.ok, false);

  const duplicate = planGigPerformerChanges(
    12,
    [
      { performerId: 7, id: "member-1", name: "회원 이름" },
      { performerId: 8, id: "member-1", name: "회원 이름" },
    ],
    [stored(7, null, "임시 이름"), stored(8, "member-1", "회원 이름")]
  );
  assert.equal(duplicate.ok, false);
});
