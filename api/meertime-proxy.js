const MEERTIME_HOST = "psrweb.jb.man.ac.uk";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl) {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid url query parameter" });
    return;
  }

  if (!isAllowedMeerTimeUrl(targetUrl)) {
    res.status(400).json({ error: "Only MeerTime .npz and pipeline_info.json files are allowed" });
    return;
  }

  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  const upstreamHeaders = {};
  if (authorization) upstreamHeaders.Authorization = authorization;

  try {
    const upstream = await fetch(targetUrl, { headers: upstreamHeaders });

    res.status(upstream.status);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !res.write(Buffer.from(value))) {
        await new Promise(resolve => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    console.error("MeerTime proxy request failed:", error);
    res.status(502).json({ error: "MeerTime proxy request failed" });
  }
}

function isAllowedMeerTimeUrl(url) {
  if (!/^https?:$/.test(url.protocol)) return false;
  if (url.host !== MEERTIME_HOST) return false;
  if (!url.pathname.startsWith("/meertime/singlepulse/")) return false;
  return url.pathname.endsWith(".npz") || url.pathname.endsWith("/pipeline_info.json");
}
