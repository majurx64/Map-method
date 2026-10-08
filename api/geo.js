export default function handler(request, response) {
  const raw = request.headers["x-vercel-ip-country"] || "XX";
  const country = /^[A-Z]{2}$/.test(raw) ? raw : "XX";
  response.setHeader("Cache-Control", "private, no-store");
  response.status(200).json({ country });
}
