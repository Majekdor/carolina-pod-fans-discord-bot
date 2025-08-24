import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { BotState } from "./models";

const {
    STATE_S3_BUCKET,
    STATE_S3_KEY = "carolina-insider/last.json",
    STATE_FILE = "./state.json"
} = process.env;

const s3 = STATE_S3_BUCKET ? new S3Client({ region: "us-east-1" }) : null;

export async function loadState(): Promise<BotState> {
    if (s3) {
        try {
            const out = await s3.send(
                new GetObjectCommand({ Bucket: STATE_S3_BUCKET, Key: STATE_S3_KEY })
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

export async function saveState(state: BotState) {
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
