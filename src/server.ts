import { config as loadEnvVars } from "dotenv";

import express from "express";
import type { Request, Response, NextFunction } from "express";

import needle from "needle";
import ErrorResponse, { buildOrdinalsBotError } from "./lib/error-response";

import prisma from "./lib/prisma-client";
import { v4 } from "uuid";
import { FileData, validateOrderData } from "./lib/validation/orders";

import {
    OrdinalsBotCreateOrderResponse,
    OrdinalsBotErrorResponse,
    OrdinalsBotWebhookPayload,
} from "./types/ordinals-bot";
import { hashFile } from "./lib/hashfile";
import { toadScheduler } from "./scheduler/toad";
import { TransactionStatus } from "@prisma/client";
import { available_rarity } from "./constants/rarity";
const app = express();

//load env
loadEnvVars();

app.use(express.json());
//cors
app.use((_, res, next) => {
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Max-Age", 24 * 60 * 60);
    next();
});

//prepare local server

app.get("/price", async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { size, fee, count, rareSats } = req.query as {
            size: string;
            fee: string;
            count?: string;
            rareSats?: string;
        };
        if (!size || !fee) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (isNaN(Number(size)) || isNaN(Number(fee))) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (Number(size) < 1 || Number(fee) < 1) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (count && isNaN(Number(count))) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (rareSats && !available_rarity.includes(rareSats)) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        const searchParams = new URLSearchParams({
            size,
            fee,
            count: count || "1",
            rareSats: rareSats || "random",
        });

        let priceResponse = await needle(
            "get",
            `${process.env.ORDINALS_BOT_API_BASE_URL}/price?${searchParams}`,
            { json: true, headers: { Accept: "application/json" } }
        );

        if (priceResponse.body.status !== "error") {
            let fee =
                priceResponse.body.totalFee + Number(process.env.REFERRAL_FEE);
            return res.status(200).json({
                message: "Price calculated",
                data: {
                    fee,
                },
                success: true,
            });
        } else {
            throw buildOrdinalsBotError(priceResponse.body);
        }
    } catch (e) {
        next(e);
    }
});

app.get(
    "/:address/status",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            //first get the user address
            let address = req.params.address;

            //then check if the user has an order already and send back those details
            let orders = await prisma.order.findMany({
                where: {
                    receiver_address: address,
                },
                select: {
                    receiver_address: true,
                    created_at: true,
                    ordinals_bot_order_id: true,
                    id: true,
                    updated_at: true,
                    status: true,
                    quantity: true,
                },
            });

            return res.status(200).json({
                message: "Orders fetched successfully",
                data: orders,
                success: true,
            });
        } catch (e) {
            next(e);
        }
    }
);

app.post(
    "/inscribe",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { files, rarity, receiverAddress, quantity } = req.body as {
                files: FileData[];
                rarity: string;
                receiverAddress: string;
                quantity?: number;
            };

            validateOrderData({
                files,
                rarity,
                receiverAddress,
                quantity,
            });
            const namedFiles = files.map((file) => ({
                ...file,
                name: `${v4()}.${file.name.split(".").pop()}`,
            }));
            // unique token for ordinals bot webhook
            const orderToken = v4();
            let data = {
                files: namedFiles,
                receiveAddress: receiverAddress,
                fee: Number(process.env.MINING_FEE),
                rareSats: rarity,
                lowPostage: true,
                referral: process.env.REFERRAL_CODE,
                additionalFee: Number(process.env.REFERRAL_FEE),
                webhookUrl: `${process.env.BASE_URL}/inscribe/update-status/${orderToken}`,
            };
            let orderResponse = await needle(
                "post",
                `${process.env.ORDINALS_BOT_API_BASE_URL}/order`,
                data,
                {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                }
            );
            const orderResponseData = orderResponse.body as
                | OrdinalsBotCreateOrderResponse
                | OrdinalsBotErrorResponse;
            if (orderResponseData.status === "ok") {
                //successful order
                //save to the db
                let newOrder = await prisma.order.create({
                    data: {
                        receiver_address: receiverAddress,
                        ordinals_bot_order_id: orderResponseData.id,
                        update_token: orderToken,
                        quantity: quantity || 1,
                    },
                    select: {
                        id: true,
                    },
                });

                for (let file of orderResponseData.files) {
                    const fileData = namedFiles.find((item) =>
                        file.name.includes(item.name)
                    )!;
                    await prisma.ordinal.create({
                        data: {
                            image_files_order_id: newOrder.id,
                            name: file.name,
                            size: file.size,
                            hash: await hashFile(fileData.dataURL),
                            duration: fileData.duration,
                            type: file.type,
                        },
                    });
                }

                //send response to client
                return res.status(200).json({
                    message: "Inscribe Order pending",
                    data: {
                        ...newOrder,
                        payment_details: {
                            ...orderResponseData.charge,
                        },
                    },
                    success: true,
                });
            }
            //an error occurred
            throw buildOrdinalsBotError(orderResponseData);
        } catch (e) {
            next(e);
        }
    }
);

//webhook which receives the file inscription status
app.post("/inscribe/update-status/:token", async (req, res, next) => {
    try {
        //once it gets here
        let payload = req.body as OrdinalsBotWebhookPayload;
        const token = req.params.token;

        if (!token) {
            throw new ErrorResponse("Invalid order token", 401);
        }

        const where = {
            name: payload.file.name,
            order: {
                update_token: token,
                ordinals_bot_order_id: payload.id,
            },
        };

        const existingFile = await prisma.ordinal.findFirst({
            where,
            include: {
                html_files_order: true,
                image_files_order: true,
            },
        });

        if (!existingFile) {
            throw new ErrorResponse("Invalid order token", 401);
        }

        if (existingFile.tx_id) {
            throw new ErrorResponse("Order already inscribed", 400);
        }

        const [tx_id, ordinal_index] = payload.tx.inscription.split("i");
        const update = await prisma.ordinal.update({
            where: {
                id: existingFile.id,
            },
            data: {
                tx_id,
                ordinal_index: Number(ordinal_index),
            },
        });

        return res.status(200).json({
            message: "Order updated successfully",
            data: update,
            success: true,
        });

        //inscribe the html file with the payload.id
    } catch (e) {
        next(e);
    }
});

//wayward route handler
app.use("*", (_req, _res, next) => {
    next(new ErrorResponse("Page not found.\n Invalid API Route", 404));
});

//general error handler
app.use(function errorHandler(
    error: ErrorResponse,
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (process.env.NODE_ENV !== "test") {
        console.log({ date: new Date(), error });
    }
    return res.status(error.statusCode).json({
        message: error.message,
        success: false,
    });
});

if (process.env.NODE_ENV !== "test") {
    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, async () => {
        console.log(`Server has started on http://localhost:${PORT}`);
    })
        .on("error", async (err) => {
            console.log({ err });
            console.log("FROM ERROR APP EVENT EMITTER");
        })
        .on("close", async () => {
            toadScheduler.stop();
        });
}

export { app };
