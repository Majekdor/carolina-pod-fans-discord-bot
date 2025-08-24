import { dateDistanceDays, jaccard, norm } from "./helpers";

export async function getAppleEpisodeLink(
    showId: string,
    title: string,
    pubDate: Date,
    country: string
): Promise<string | null> {
    if (!showId) return null;
    const url = `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&country=${country}&limit=200`;
    const res = await fetch(url);
    const json: any = await res.json();
    const eps = (json.results || []).filter((r: any) => (r.wrapperType || "").toLowerCase().includes("episode"));

    const target = norm(title);
    const best = eps
        .map((e: any) => {
            const name = norm(e.trackName || "");
            const d = e.releaseDate ? new Date(e.releaseDate) : new Date(0);
            const score = jaccard(target, name) + dateDistanceDays(pubDate, d);
            return { e, score };
        })
        .sort((a: any, b: any) => a.score - b.score)[0];

    return best?.e?.trackViewUrl || null;
}
