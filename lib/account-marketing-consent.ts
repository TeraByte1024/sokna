import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { savePushConsent } from "@/lib/push-consent";

/** Auth app_metadata is server-owned; audience preferences never create a member row. */
export async function getAccountMarketingConsent(user: User) {
  const { data, error } = await (await createClient()).from("users")
    .select("marketing_opt_in").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data ? data.marketing_opt_in === true : user.app_metadata?.marketing_opt_in === true;
}

export async function saveAccountMarketingConsent(user: User, consented: boolean) {
  if (typeof consented !== "boolean") throw new Error("Invalid marketing consent");
  const client = await createClient();
  const { data, error } = await client.from("users")
    .select("id").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    const { error: saveError } = await savePushConsent(client, user.id, consented);
    if (saveError) throw saveError;
    return;
  }
  const service = createServiceClient();
  const { data: current, error: readError } = await service.auth.admin.getUserById(user.id);
  if (readError || !current.user) throw readError ?? new Error("Missing account");
  const previous = current.user.app_metadata ?? {};
  // Do not rewrite the first opt-in time on retries; a withdrawal clears it.
  const optedInAt = consented
    ? previous.marketing_opt_in === true ? previous.marketing_opted_in_at ?? null : new Date().toISOString()
    : null;
  const { error: saveError } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: { marketing_opt_in: consented, marketing_opted_in_at: optedInAt },
  });
  if (saveError) throw saveError;
}
