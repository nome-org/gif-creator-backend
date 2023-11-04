import { createConfig } from "express-zod-api";
const PORT = Number(process.env.PORT || 3000);
export const config = createConfig({
    server: {
        listen: PORT, // port, UNIX socket or options
    },
    cors: true,
    logger: {
        level: "debug",
        color: true,
    },
});
