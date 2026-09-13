import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const envText = fs.readFileSync(".env.local", "utf8");
const env = {};
envText.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = (match[2] || "").trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // 1. 전체 셋리스트 조회 (anon key로 가능한지)
  const { data: allSetlists, error: selectErr } = await supabase
    .from("setlists")
    .select("id, gig_id, title, created_by");
  console.log("All setlists:", allSetlists, "Select error:", selectErr);

  // 2. 임의의 셋리스트 삽입 및 삭제 테스트
  const { data: inserted, error: insertErr } = await supabase
    .from("setlists")
    .insert({
      gig_id: 3,
      title: "삭제 테스트 곡",
      artist: "테스트",
    })
    .select()
    .single();

  console.log("Inserted:", inserted, "Insert error:", insertErr);

  if (inserted) {
    const { error: delErr } = await supabase
      .from("setlists")
      .delete()
      .eq("id", inserted.id);
    console.log("Deleted:", inserted.id, "Delete error:", delErr);
  }
}

test();
