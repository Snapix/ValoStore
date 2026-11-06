export default async function handler(req, res) {
  const query = String(req.query?.q || "").trim();
  if (query.length < 2) {
    return res.status(200).json({ results: [], live: false });
  }

  try {
    const upstream = await fetch("https://flathub.org/api/v2/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify({ query, filters: [] })
    });

    if (!upstream.ok) {
      throw new Error(`Flathub returned ${upstream.status}`);
    }

    const payload = await upstream.json();
    const hits = Array.isArray(payload) ? payload : (payload.hits || payload.results || []);

    const results = hits
      .slice(0, 12)
      .map((item) => {
        const appId = item.app_id || item.appId || item.id || "";
        return {
          id: `live:flathub:${appId}`,
          source: "Flathub",
          platform: "linux",
          appId,
          name: item.name || appId,
          summary: item.summary || "",
          categories: Array.isArray(item.categories) ? item.categories : [],
          icon: item.icon || "",
          upstream: appId ? `https://flathub.org/apps/${encodeURIComponent(appId)}` : "",
          install: appId ? {
            type: "flatpak",
            remote: "flathub",
            appId,
            command: `flatpak install flathub ${appId}`
          } : undefined
        };
      })
      .filter((item) => item.appId && item.name);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({ results, live: true });
  } catch {
    return res.status(200).json({ results: [], live: false });
  }
}
