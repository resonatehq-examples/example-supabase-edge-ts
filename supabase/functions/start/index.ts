// ---------------------------------------------------------------------------
// start — triggers a workflow by UUID and function name
// ---------------------------------------------------------------------------
// Standard Resonate Supabase start template.
// Forwards POST body to the flows function's resonate.run().

const FLOWS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/flows`;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { uuid, func, args = [] } = body as {
    uuid: string;
    func: string;
    args: unknown[];
  };

  if (!uuid || !func) {
    return new Response(
      JSON.stringify({ error: "uuid and func are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const auth = req.headers.get("Authorization") ?? "";

  // Delegate to the flows function
  const response = await fetch(FLOWS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({ uuid, func, args }),
  });

  const data = await response.json();
  return new Response(JSON.stringify({ uuid, ...data }), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});
