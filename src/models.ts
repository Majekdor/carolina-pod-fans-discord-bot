export type BotState = { lastGuid?: string };

export type Episode = {
    guid: string;
    title: string;
    description: string;
    pubDate: Date;
    audioUrl?: string;
};

export type Embed = {
    title?: string;
    url?: string;
    description?: string;
    timestamp?: string;
};

export type SpotifyToken = {
    access_token: string;
    token_type: string;
    expires_in: number;
    obtained_at: number;
};
