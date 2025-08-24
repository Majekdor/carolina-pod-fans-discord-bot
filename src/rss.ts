import Parser from "rss-parser";
import crypto from "node:crypto";
import type { Episode } from "./models";

export async function fetchLatestEpisode(feedUrl: string): Promise<Episode | null> {
    const parser = new Parser({
        headers: { "User-Agent": "GitHub/Majekdor/carolina-pod-fans-discord-bot/1.0.0" },
        timeout: 15000
    });
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || [])
        .map(it => {
            const guid =
                it.guid ||
                it.link ||
                crypto.createHash("sha1").update((it.title || "") + (it.pubDate || "")).digest("hex");
            const description = (it as any)["itunes:summary"] || it.contentSnippet || it.content || it.summary || "";
            const audioUrl = (it.enclosure && (it.enclosure as any).url) || (it as any)?.itunes?.image;
            return {
                guid,
                title: it.title || "New Episode",
                description,
                pubDate: it.isoDate ? new Date(it.isoDate) : it.pubDate ? new Date(it.pubDate) : new Date(),
                audioUrl
            };
        })
        .sort((a, b) => +b.pubDate - +a.pubDate);

    return items[0] ?? null;
}
