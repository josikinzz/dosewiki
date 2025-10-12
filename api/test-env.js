export default async function handler(req, res) {
  const keys = ["ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];

  const details = {};
  keys.forEach((key) => {
    const val = process.env[key];
    details[key] = val ? `EXISTS (${val.length} chars)` : "UNDEFINED";
  });

  return res.status(200).json({
    keysFound: keys.filter((key) => typeof process.env[key] === "string" && process.env[key].length > 0).length,
    totalKeys: keys.length,
    details,
    timestamp: new Date().toISOString(),
  });
}
