// ---------------------------------------------------------------------------
// Resonate + Supabase Edge Functions
// ---------------------------------------------------------------------------
//
// This edge function processes new user signups durably.
// When a user signs up in Supabase, the Database Webhook fires this function.
// Resonate makes each step durable — if the function times out or crashes,
// it resumes from the last checkpoint on the next invocation.
//
// Steps:
//   1. Validate user data
//   2. Send welcome email
//   3. Provision free trial resources
//   4. Notify sales CRM
//
// Architecture:
//   Supabase DB change
//     → Database Webhook → POST /functions/v1/flows
//       → Edge Function wakes up
//         → Polls Resonate Server for workflow state
//           → Executes next step
//             → Returns (function exits)
//
// The Resonate Server holds state between invocations — the edge function
// is stateless but the workflow is durable.

import { Resonate, type Context } from "@resonatehq/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  plan: "free" | "pro";
  created_at: string;
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
// Workflow steps — plain async functions
// ---------------------------------------------------------------------------

async function validateUser(_ctx: Context, user: UserRecord): Promise<boolean> {
  if (!user.id || !user.email) {
    throw new Error(`Invalid user record: missing id or email`);
  }
  console.log(`[validate]   user ${user.id} (${user.email}) — OK`);
  return true;
}

async function sendWelcomeEmail(_ctx: Context, user: UserRecord): Promise<boolean> {
  // In production: call your email provider (SendGrid, Resend, etc.)
  console.log(`[email]      Sending welcome email to ${user.email}...`);
  await new Promise((r) => setTimeout(r, 200));
  console.log(`[email]      Welcome email sent to ${user.email}`);
  return true;
}

async function provisionTrial(_ctx: Context, user: UserRecord): Promise<string> {
  // In production: provision trial resources (workspace, API key, etc.)
  console.log(`[provision]  Provisioning ${user.plan} trial for ${user.id}...`);
  await new Promise((r) => setTimeout(r, 300));
  const workspaceId = `ws_${user.id.slice(0, 8)}`;
  console.log(`[provision]  Trial workspace created: ${workspaceId}`);
  return workspaceId;
}

async function notifyCRM(
  _ctx: Context,
  user: UserRecord,
  workspaceId: string,
): Promise<boolean> {
  // In production: call your CRM (HubSpot, Salesforce, etc.)
  console.log(`[crm]        Syncing user ${user.id} → CRM (workspace: ${workspaceId})`);
  await new Promise((r) => setTimeout(r, 150));
  console.log(`[crm]        CRM updated`);
  return true;
}

// ---------------------------------------------------------------------------
// The onboarding workflow
// ---------------------------------------------------------------------------

function* onboardUser(
  ctx: Context,
  user: UserRecord,
): Generator<any, OnboardingResult, any> {
  // Each step is checkpointed. If the edge function times out between steps,
  // the next invocation resumes from where it left off.
  yield* ctx.run(validateUser, user);

  yield* ctx.run(sendWelcomeEmail, user);

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
// Resonate setup
// ---------------------------------------------------------------------------
// Reads RESONATE_URL from environment automatically.

const resonate = new Resonate();
resonate.register("onboardUser", onboardUser);

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------
//
// Supabase Database Webhook payload looks like:
//   {
//     "type": "INSERT",
//     "table": "users",
//     "record": { "id": "...", "email": "...", ... },
//     "schema": "public"
//   }
//
// We use record.id as the promise ID — idempotent if the webhook fires twice.

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();

    // Handle Database Webhook trigger
    if (payload.type === "INSERT" && payload.table === "users") {
      const user = payload.record as UserRecord;
      const promiseId = `onboard/${user.id}`;

      console.log(`[webhook]    New user signup: ${user.email} (${user.id})`);

      // Start (or resume) the onboarding workflow.
      // If the webhook fires twice for the same user, the second call
      // finds the existing promise and returns the cached result.
      const result = await resonate.run(promiseId, onboardUser, user);

      return new Response(JSON.stringify({ status: "ok", result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Let Resonate handle internal execution callbacks
    return resonate.handler(req);
  } catch (err) {
    console.error("[flows]      Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
