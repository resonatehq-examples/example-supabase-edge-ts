// ---------------------------------------------------------------------------
// probe — checks the status of a workflow by UUID
// ---------------------------------------------------------------------------
// Standard Resonate Supabase probe template.
// Queries the Resonate Server directly for promise state.

const RESONATE_URL = Deno.env.get("RESONATE_URL")!;
const RESONATE_AUTH_TOKEN = Deno.env.get("RESONATE_AUTH_TOKEN");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { uuid } = (await req.json()) as { uuid: string };

  if (!uuid) {
    return new Response(
      JSON.stringify({ error: "uuid is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (RESONATE_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${RESONATE_AUTH_TOKEN}`;
  }

  const response = await fetch(`${RESONATE_URL}/promises/${encodeURIComponent(uuid)}`, {
    headers,
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: "Promise not found", uuid }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const promise = await response.json();

  return new Response(
    JSON.stringify({
      uuid,
      status: promise.state,
      value: promise.value?.data ?? null,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
