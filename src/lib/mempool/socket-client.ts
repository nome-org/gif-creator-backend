import mempoolJS from "@mempool/mempool.js";
export const mempool = mempoolJS({
    hostname: process.env.MEMPOOL_BASE_URL?.replace("https://", "").replace(
        "/api",
        ""
    ),
});

export const initMempoolSocket = async () => {
    const ws = mempool.bitcoin.websocket.initServer({
        options: ["blocks"],
    });

    ws.on("message", function incoming(data: any) {
        const res = JSON.parse(data.toString());
        if (res.block) {
        }
    });
    return () => {
        ws.close();
    };
};
