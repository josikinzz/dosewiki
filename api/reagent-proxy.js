/**
 * Vercel serverless proxy for ProtestKit.eu API.
 * Bypasses CORS restrictions for browser-based requests.
 *
 * Usage: GET /api/reagent-proxy?substance=mdma
 */

export default async function handler(req, res) {
  // Allow CORS for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { substance } = req.query;

  if (!substance || typeof substance !== "string") {
    return res.status(400).json({ error: "Missing substance parameter" });
  }

  // Sanitize substance name - only allow alphanumeric and hyphens
  const sanitized = substance.toLowerCase().replace(/[^a-z0-9-]/g, "");

  if (sanitized.length === 0 || sanitized.length > 100) {
    return res.status(400).json({ error: "Invalid substance parameter" });
  }

  try {
    const response = await fetch(
      `https://protestkit.eu/api/v1/${encodeURIComponent(sanitized)}`,
      {
        headers: {
          "User-Agent": "dose.wiki/1.0 (harm-reduction-resource)",
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      // Pass through 404 for substances not in database
      if (response.status === 404) {
        return res.status(404).json({ error: "Substance not found" });
      }
      return res.status(response.status).json({ error: "Upstream API error" });
    }

    const data = await response.json();

    // Cache at edge for 1 hour to reduce load on ProtestKit
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

    return res.status(200).json(data);
  } catch (error) {
    console.error("ProtestKit proxy error:", error);
    return res.status(500).json({ error: "Failed to fetch from ProtestKit" });
  }
}
