import http from "node:http";

export function startHealthServer(port: number) {
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
        .listen(port, () => console.log("health listening", port));
}
