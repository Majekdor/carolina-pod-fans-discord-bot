export function assertEnv(name: string, value?: string) {
    if (!value) throw new Error(`Missing required env: ${name}`);
}

export const sleep = (ms: number) =>
    new Promise(res => setTimeout(res, ms));

export const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function jaccard(a: string, b: string) {
    if (a === b) return 0;
    const A = new Set(a.split(" ").filter(Boolean));
    const B = new Set(b.split(" ").filter(Boolean));
    const inter = [...A].filter(x => B.has(x)).length;
    const uni = new Set([...A, ...B]).size || 1;
    return 1 - inter / uni; // smaller is better
}

export function dateDistanceDays(a: Date, b: Date) {
    return Math.abs(+a - +b) / (1000 * 60 * 60 * 24);
}
