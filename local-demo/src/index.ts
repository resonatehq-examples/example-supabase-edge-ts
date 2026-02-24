// ---------------------------------------------------------------------------
// Local simulation of the Supabase Edge Function workflow
// ---------------------------------------------------------------------------
//
// This runs the same workflow logic that the edge function runs in production,
// but uses the standard @resonatehq/sdk instead of @resonatehq/supabase.
// The workflow code is identical — only the Resonate shim differs.
//
// Run: npm start           (happy path — user onboarding completes)
// Run: npm run start:crash (email fails on attempt 1, retries, succeeds)

import { Resonate, type Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  plan: "free" | "pro";
}

interface OnboardingResult {
  userId: string;
  email: string;
  emailSent: boolean;
  trialProvisioned: boolean;
  crmUpdated: boolean;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Step implementations — same functions as in the edge function
// ---------------------------------------------------------------------------

const emailAttempts = new Map<string, number>();

function validateUser(_ctx: unknown, user: UserRecord): boolean {
  if (!user.id || !user.email) {
    throw new Error(`Invalid user record: missing id or email`);
  }
  console.log(`[validate]   user ${user.id} (${user.email}) — OK`);
  return true;
}

async function sendWelcomeEmail(
  _ctx: unknown,
  user: UserRecord,
  simulateCrash: boolean,
): Promise<boolean> {
  const attempt = (emailAttempts.get(user.id) ?? 0) + 1;
  emailAttempts.set(user.id, attempt);

  if (simulateCrash && attempt === 1) {
    console.log(`[email]      SMTP timeout for ${user.email} (attempt 1)`);
    throw new Error("SMTP connection timeout");
  }

  console.log(
    `[email]      Sending welcome email to ${user.email}${attempt > 1 ? ` (attempt ${attempt})` : ""}...`,
  );
  await new Promise((r) => setTimeout(r, 200));
  console.log(`[email]      Welcome email sent to ${user.email}`);
  return true;
}

async function provisionTrial(_ctx: unknown, user: UserRecord): Promise<string> {
  console.log(`[provision]  Provisioning ${user.plan} trial for ${user.id}...`);
  await new Promise((r) => setTimeout(r, 300));
  const workspaceId = `ws_${user.id.slice(0, 8)}`;
  console.log(`[provision]  Trial workspace created: ${workspaceId}`);
  return workspaceId;
}

async function notifyCRM(
  _ctx: unknown,
  user: UserRecord,
  workspaceId: string,
): Promise<boolean> {
  console.log(`[crm]        Syncing user ${user.id} → CRM (workspace: ${workspaceId})`);
  await new Promise((r) => setTimeout(r, 150));
  console.log(`[crm]        CRM updated`);
  return true;
}

// ---------------------------------------------------------------------------
// The onboarding workflow — identical to the edge function version
// ---------------------------------------------------------------------------

function* onboardUser(
  ctx: Context,
  user: UserRecord,
  simulateCrash: boolean,
): Generator<any, OnboardingResult, any> {
  yield* ctx.run(validateUser, user);
  yield* ctx.run(sendWelcomeEmail, user, simulateCrash);
  const workspaceId = yield* ctx.run(provisionTrial, user);
  yield* ctx.run(notifyCRM, user, workspaceId);

  return {
    userId: user.id,
    email: user.email,
    emailSent: true,
    trialProvisioned: true,
    crmUpdated: true,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Run the demo — simulates a Supabase Database Webhook firing
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register("onboardUser", onboardUser);

const simulateCrash = process.argv.includes("--crash");

const user: UserRecord = {
  id: `usr_${Date.now()}`,
  email: "alice@example.com",
  fullName: "Alice Chen",
  plan: "free",
};

// Simulate the Database Webhook payload
const dbWebhookPayload = {
  type: "INSERT",
  table: "users",
  schema: "public",
  record: user,
};

if (simulateCrash) {
  console.log("=== Supabase Edge Function + Resonate Demo ===");
  console.log("Mode: CRASH (SMTP times out on first attempt, retries)\n");
  console.log("[webhook]    Database trigger fired:");
  console.log(`             table: ${dbWebhookPayload.table}, type: ${dbWebhookPayload.type}`);
  console.log(`             user: ${user.email} (${user.id})\n`);
} else {
  console.log("=== Supabase Edge Function + Resonate Demo ===");
  console.log("Mode: HAPPY PATH (all 4 steps complete successfully)\n");
  console.log("[webhook]    Database trigger fired:");
  console.log(`             table: ${dbWebhookPayload.table}, type: ${dbWebhookPayload.type}`);
  console.log(`             user: ${user.email} (${user.id})\n`);
}

// Edge function receives the webhook and calls resonate.run()
// Promise ID = `onboard/${user.id}` — idempotent if webhook fires twice
const result = await resonate.run(
  `onboard/${user.id}`,
  onboardUser,
  user,
  simulateCrash,
);

console.log("\n=== Onboarding Complete ===");
console.log(JSON.stringify(result, null, 2));

if (simulateCrash) {
  console.log(
    "\nNotice: validate ran once. Email timed out → retried → succeeded.",
    "\nProvision and CRM sync only ran after email confirmed.",
    "\nWelcome email sent exactly once.",
  );
}
