const parseBody = (rawBody) => {
  if (rawBody == null) {
    return {};
  }

  if (typeof rawBody === "string" && rawBody.trim().length > 0) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  if (typeof rawBody === "object") {
    return rawBody;
  }

  return {};
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured." });
  }

  const body = parseBody(req.body);
  const providedPassword = typeof body.password === "string" ? body.password : "";

  if (providedPassword !== adminPassword) {
    return res.status(401).json({ error: "Invalid password." });
  }

  return res.status(200).json({ authorized: true });
}
