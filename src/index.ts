import Parser from "rss-parser";
import crypto from "node:crypto";
import http from "node:http";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// ================== Config (ENV) ==================
const {
    DISCORD_BOT_TOKEN,
    FORUM_CHANNEL_ID,
    FEED_URL = "https://rss.art19.com/carolina-insider",
    POLL_SECONDS = "900", // 15m
    // Apple
    APPLE_COUNTRY = "US",
    APPLE_SHOW_ID = "1153767411",
    // Spotify
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    SPOTIFY_MARKET = "US",
    SPOTIFY_SHOW_ID = "2QJzvnL7OWI9XZ432l3glX",
    // State storage (S3 preferred on EB)
    STATE_S3_BUCKET,
    STATE_S3_KEY = "carolina-insider/last.json",
    STATE_FILE = "./state.json"
} = process.env;

assertEnv("DISCORD_BOT_TOKEN", DISCORD_BOT_TOKEN);
assertEnv("FORUM_CHANNEL_ID",  FORUM_CHANNEL_ID);
assertEnv("SPOTIFY_CLIENT_ID", SPOTIFY_CLIENT_ID);
assertEnv("SPOTIFY_CLIENT_SECRET", SPOTIFY_CLIENT_SECRET);

// ================== Helpers ==================
function assertEnv(name: string, value?: string) {
    if (!value) throw new Error(`Missing required env: ${name}`);
}
const sleep = (ms: number) =>
    new Promise(res => setTimeout(res, ms));
const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function jaccard(a: string, b: string) {
    if (a === b) return 0;
    const A = new Set(a.split(" ").filter(Boolean));
    const B = new Set(b.split(" ").filter(Boolean));
    const inter = [...A].filter(x => B.has(x)).length;
    const uni = new Set([...A, ...B]).size || 1;
    return 1 - inter / uni; // smaller is better
}
function dateDistanceDays(a: Date, b: Date) {
    return Math.abs(+a - +b) / (1000 * 60 * 60 * 24);
}

// ================== State store (S3 or local) ==================
type BotState = { lastGuid?: string };

const s3 = STATE_S3_BUCKET ? new S3Client({region: "us-east-1"}) : null;

async function loadState(): Promise<BotState> {
    if (s3) {
        try {
            const out = await s3.send(
                new GetObjectCommand({
                    Bucket: STATE_S3_BUCKET,
                    Key: STATE_S3_KEY
                })
            );
            const text = await out.Body?.transformToString();
            return text ? JSON.parse(text) : {};
        } catch {
            return {};
        }
    } else {
        try {
            const fs = await import("node:fs/promises");
            const txt = await fs.readFile(STATE_FILE, "utf8");
            return txt ? JSON.parse(txt) : {};
        } catch {
            return {};
        }
    }
}

async function saveState(state: BotState) {
    const data = JSON.stringify(state, null, 2);
    if (s3) {
        await s3.send(
            new PutObjectCommand({
                Bucket: STATE_S3_BUCKET,
                Key: STATE_S3_KEY,
                Body: data,
                ContentType: "application/json"
            })
        );
    } else {
        const fs = await import("node:fs/promises");
        await fs.writeFile(STATE_FILE, data);
    }
}

// ================== RSS (Art19) ==================
type Episode = {
    guid: string;
    title: string;
    description: string;
    pubDate: Date;
    audioUrl?: string;
};

async function fetchLatestEpisode(feedUrl: string): Promise<Episode | null> {
    const parser = new Parser({
        headers: { "User-Agent": "GitHub/Majekdor/carolina-pod-fans-discord-bot/1.0.0" },
        timeout: 15000
    });
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || []).map(it => {
        const guid = it.guid || it.link || crypto.createHash("sha1")
            .update((it.title || "") + (it.pubDate || "")).digest("hex");
        const description = (it["itunes:summary"]) || it.contentSnippet || it.content || it.summary || "";
        const audioUrl = (it.enclosure && (it.enclosure).url) || (it)?.itunes?.image;
        return {
            guid,
            title: it.title || "New Episode",
            description,
            pubDate: it.isoDate ? new Date(it.isoDate) : (it.pubDate ? new Date(it.pubDate) : new Date()),
            audioUrl
        };
    }).sort((a, b) => +b.pubDate - +a.pubDate);

    return items[0] ?? null;
}

// ================== Apple Podcasts ==================
async function getAppleEpisodeLink(showId: string, title: string, pubDate: Date): Promise<string | null> {
    if (!showId) return null;
    const url = `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&country=${APPLE_COUNTRY}&limit=200`;
    const res = await fetch(url);
    const json: any = await res.json();
    const eps = (json.results || []).filter((r: any) =>
        (r.wrapperType || "").toLowerCase().includes("episode"));

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

// ================== Spotify ==================
type SpotifyToken = { access_token: string; token_type: string; expires_in: number; obtained_at: number };
let cacheToken: SpotifyToken | null = null;

async function spotifyToken(): Promise<string> {
    if (cacheToken && (Date.now() - cacheToken.obtained_at) < (cacheToken.expires_in - 60) * 1000) {
        return cacheToken.access_token;
    }
    const body = new URLSearchParams({ grant_type: "client_credentials" }).toString();
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body
    });
    const json = await res.json();
    cacheToken = { ...json, obtained_at: Date.now() };
    return json.access_token;
}

async function getSpotifyEpisodeLink(showId: string, title: string, pubDate: Date): Promise<string | null> {
    if (!showId) return null;
    const token = await spotifyToken();
    const res = await fetch(`https://api.spotify.com/v1/shows/${showId}/episodes?limit=50&market=${SPOTIFY_MARKET}`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
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

    return best?.e?.external_urls?.spotify ?? null;
}

// ================== Discord: create forum post ==================
type Embed = {
    title?: string;
    url?: string;
    description?: string;
    timestamp?: string;
};

async function createForumPost(
    forumId: string,
    name: string,
    content: string,
    embeds?: Embed[],
    applied_tags?: string[]
) {
    const body = {
        name,
        auto_archive_duration: 4320, // 3 days
        applied_tags,
        message: {
            content,
            embeds: embeds?.length ? embeds : undefined,
            allowed_mentions: { parse: [] }
        }
    };

    const resp = await fetch(`https://discord.com/api/v10/channels/${forumId}/threads`, {
        method: "POST",
        headers: {
            "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Discord error ${resp.status}: ${text}`);
    }
}

// ================== Bot loop ==================
async function runOnce() {
    const state = await loadState();
    const latest = await fetchLatestEpisode(FEED_URL);
    if (!latest) return;

    if (state.lastGuid === latest.guid) return; // nothing new

    // Resolve podcast platform links in parallel
    const [appleLink, spotifyLink] = await Promise.all([
        getAppleEpisodeLink(APPLE_SHOW_ID, latest.title, latest.pubDate),
        getSpotifyEpisodeLink(SPOTIFY_SHOW_ID, latest.title, latest.pubDate)
    ]);

    if (!appleLink || !spotifyLink) {
        console.log(`[skipped] ${latest.title}`);
        return;
    }

    // Compose post
    const cleanDesc = (latest.description || "").replaceAll("\n", "\n\n");
    const contentLines = [
        ':headphones: New Carolina Insider Episode! :headphones:',
        `**${latest.title}**`,
        "\n",
        cleanDesc,
        "\n",
        appleLink ? `**Apple Podcasts:** ${appleLink}` : "• Apple link: _(not found yet)_",
        spotifyLink ? `**Spotify:** ${spotifyLink}` : "• Spotify link: _(not found yet)_"
    ].filter(Boolean);

    const embeds: Embed[] = [];

    if (!FORUM_CHANNEL_ID) {
        console.log(`[skipped] ${latest.title} (no channel ID)`);
        return;
    }

    await createForumPost(
        FORUM_CHANNEL_ID,
        latest.title,
        contentLines.join("\n"),
        embeds
    );

    await saveState({ lastGuid: latest.guid });
    console.log(`[posted] ${latest.title}`);
}

async function main() {
    console.log("Carolina Insider bot started. Polling:", FEED_URL);
    // Fire immediately, then poll
    try {
        await runOnce();
    } catch (e: any) {
        console.error("runOnce error:", e.message);
    }
    const interval = Number(POLL_SECONDS) * 1000;
    for (;;) {
        await sleep(interval);
        try {
            await runOnce();
        } catch (e: any) {
            console.error("runOnce error:", e.message);
        }
    }
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});

const port = Number(process.env.PORT || 5000);
http
    .createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200);
            res.end("ok");
            return;
        }
        res.writeHead(404);
        res.end();
    })
    .listen(
        port,
        () => console.log("health listening", port)
    );