export const fetchSessionIndex = async () => {
  try {
    const res = await fetch('/__sessions_index');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch sessions index', err);
    return [];
  }
};

export const loadSessions = async () => {
  const index = await fetchSessionIndex();
  const items = await Promise.all(
    index.map(async ({ rel, url }) => {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`);
        if (!res.ok) return null;
        const raw = await res.text();
        return { path: rel, raw };
      } catch (err) {
        console.warn('Failed to load session', url, err);
        return null;
      }
    }),
  );
  return items.filter(Boolean);
};
