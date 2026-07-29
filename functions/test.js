// Cloudflare Pages Functions: /test
export async function onRequestGet() {
  return new Response(
    JSON.stringify({ message: "Hello, World!" }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
