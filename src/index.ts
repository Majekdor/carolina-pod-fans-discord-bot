import { assertEnv, sleep } from "./helpers.js";
import { loadState, saveState } from "./state.js";
import { fetchLatestEpisode } from "./rss.js";
import { getLatestAppleEpisode } from "./apple.js";
import { getLatestSpotifyEpisode } from "./spotify.js";
import { createForumPost } from "./discord.js";
import { startHealthServer } from "./health.js";
import type { Embed } from "./models";

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
} = process.env;

assertEnv("DISCORD_BOT_TOKEN", DISCORD_BOT_TOKEN);
assertEnv("FORUM_CHANNEL_ID", FORUM_CHANNEL_ID);
assertEnv("SPOTIFY_CLIENT_ID", SPOTIFY_CLIENT_ID);
assertEnv("SPOTIFY_CLIENT_SECRET", SPOTIFY_CLIENT_SECRET);

// ================== Bot loop ==================
async function runOnce() {
    const state = await loadState();
    const latest = await fetchLatestEpisode(FEED_URL!);
    if (!latest) return;

    if (state.lastGuid === latest.guid) return; // nothing new

    // Resolve podcast platform links in parallel
    const [appleEpisode, spotifyEpisode] = await Promise.all([
        getLatestAppleEpisode(
            APPLE_SHOW_ID!,
            latest.title,
            latest.pubDate,
            APPLE_COUNTRY
        ),
        getLatestSpotifyEpisode(
            SPOTIFY_SHOW_ID!,
            latest.title,
            latest.pubDate,
            SPOTIFY_MARKET,
            SPOTIFY_CLIENT_ID!,
            SPOTIFY_CLIENT_SECRET!
        )
    ]);

    if (appleEpisode?.episodeId === state.lastGuid) return; // Something new, but Apple Podcasts hasn't updated yet
    if (spotifyEpisode?.episodeId === state.lastSpotifyEpisodeId) return; // Something new, but Spotify hasn't updated yet

    if (!appleEpisode || !spotifyEpisode) {
        console.log(`[skipped] ${latest.title}`);
        return;
    }

    // Compose post
    const cleanDesc = (latest.description || "").replaceAll("\n", "\n\n");
    const contentLines = [
        ":headphones: New Carolina Insider Episode! :headphones:",
        `**${latest.title}**`,
        "\n",
        cleanDesc,
        "\n",
        appleEpisode ? `**Apple Podcasts:** ${appleEpisode.link}` : "• Apple link: _(not found yet)_",
        spotifyEpisode ? `**Spotify:** ${spotifyEpisode.link}` : "• Spotify link: _(not found yet)_"
    ].filter(Boolean);

    const embeds: Embed[] = [];

    if (!FORUM_CHANNEL_ID) {
        console.log(`[skipped] ${latest.title} (no channel ID)`);
        return;
    }

    await createForumPost(
        DISCORD_BOT_TOKEN!,
        FORUM_CHANNEL_ID,
        latest.title,
        contentLines.join("\n"),
        embeds
    );

    await saveState({
        lastGuid: latest.guid,
        lastSpotifyEpisodeId: spotifyEpisode?.episodeId
    });
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
startHealthServer(port);
