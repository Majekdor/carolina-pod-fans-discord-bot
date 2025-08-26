import { dateDistanceDays, jaccard, norm } from "./helpers.js";
import type { PlatformEpisode, SpotifyToken } from "./models";

let cacheToken: SpotifyToken | null = null;

async function spotifyToken(clientId: string, clientSecret: string): Promise<string> {
    if (cacheToken && Date.now() - cacheToken.obtained_at < (cacheToken.expires_in - 60) * 1000) {
        return cacheToken.access_token;
    }
    const body = new URLSearchParams({ grant_type: "client_credentials" }).toString();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body
    });
    const json = await res.json();
    cacheToken = { ...json, obtained_at: Date.now() };
    return json.access_token;
}

export async function getLatestSpotifyEpisode(
    showId: string,
    title: string,
    pubDate: Date,
    market: string,
    clientId: string,
    clientSecret: string
): Promise<PlatformEpisode | null> {
    if (!showId) return null;
    const token = await spotifyToken(clientId, clientSecret);
    const res = await fetch(
        `https://api.spotify.com/v1/shows/${showId}/episodes?limit=50&market=${market}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const json: any = await res.json();
    const items: any[] = json.items || [];
    const target = norm(title);

    const best = items
        .map(e => {
            const name = norm(e.name || "");
            const d = e.release_date ? new Date(`${e.release_date}T00:00:00Z`) : new Date(0);
            const score = jaccard(target, name) + dateDistanceDays(pubDate, d);
            return { e, score };
        })
        .sort((a, b) => a.score - b.score)[0];

    const link = best?.e?.external_urls?.spotify;
    const episodeId = best?.e?.id;

    if (!link || !episodeId) {
        return null;
    }

    return {
        episodeId,
        link
    }
}
