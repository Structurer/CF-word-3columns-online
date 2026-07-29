// Cloudflare Pages Functions: /
// Serves word.html as the index page at root path

async function fetchWordHtml(context) {
  const assetUrl = new URL("/word.html", context.request.url).toString();
  // Try ASSETS binding first (Pages production)
  if (context.env?.ASSETS) {
    try {
      const r = await context.env.ASSETS.fetch(assetUrl);
      if (r && r.ok) return r;
    } catch (_) {
      // fall through
    }
  }
  // Fallback: plain fetch (wrangler pages dev local mode)
  try {
    const r = await fetch(assetUrl);
    if (r && r.ok) return r;
  } catch (_) {
    // fall through
  }
  return null;
}

export async function onRequestGet(context) {
  const response = await fetchWordHtml(context);
  if (response) {
    return response;
  }
  return new Response("word.html not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
