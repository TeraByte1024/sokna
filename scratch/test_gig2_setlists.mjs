import { createClient } from "@supabase/supabase-js";
import fs from "fs";

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

// 관리자 계정으로 로그인하여 셋리스트 삭제 테스트
// admins 테이블의 관리자 목록 확인
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAdminAction() {
  // 현재 셋리스트 목록 확인
  const { data: setlists } = await supabase
    .from("setlists")
    .select("id, gig_id, title")
    .eq("gig_id", 2);

  console.log("Gig 2 setlists count:", setlists?.length);
  console.log(setlists?.map(s => `${s.id}: ${s.title}`));
}

testAdminAction();
