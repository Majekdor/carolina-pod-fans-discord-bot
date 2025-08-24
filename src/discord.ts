import type { Embed } from "./models";

export async function createForumPost(
    discordBotToken: string,
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
            Authorization: `Bot ${discordBotToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Discord error ${resp.status}: ${text}`);
    }
}
