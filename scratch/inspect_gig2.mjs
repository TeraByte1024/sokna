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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectGig2() {
  const { data: gig } = await supabase.from("gigs").select("*").eq("id", 2).single();
  console.log("Gig 2:", {
    title: gig.title,
    subtitle: gig.subtitle,
    perform_date: gig.perform_date,
    meeting_date: gig.meeting_date,
  });

  const { data: setlists } = await supabase
    .from("setlists")
    .select("id, order_num, title, artist, session_members, updated_at")
    .eq("gig_id", 2)
    .order("order_num", { ascending: true });

  console.log(`Gig 2 has ${setlists?.length} songs:`);
  setlists?.forEach((s) => {
    console.log(`[#${s.order_num}] (id:${s.id}) "${s.title}" - "${s.artist}" | members: ${s.session_members} | updated: ${s.updated_at}`);
  });
}

inspectGig2();
