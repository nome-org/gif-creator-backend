import { config as loadEnvVars } from "dotenv";
import { createServer } from "express-zod-api";
import { routing } from "./router/router";
import { config as serverConfig } from "./server-config";

loadEnvVars();

const { app } = createServer(serverConfig, routing);
export { app };
