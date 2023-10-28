import { config as loadEnvVars } from "dotenv";

import express from "express";
import type { Request, Response, NextFunction } from "express";

import needle from "needle";
import ErrorResponse from "./lib/error-response";

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
const app = express();

//load env
loadEnvVars();

const safeOrderFields = {
    receiver_address: true,
    created_at: true,
    ordinals_bot_order_id: true,
    id: true,
    updated_at: true,
};

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

const buildOrdinalsBotError = (body: OrdinalsBotErrorResponse) => {
    return new ErrorResponse(body.error || body.reason, 500);
};

//prepare local server

app.get("/price", async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { size, fee, count, rareSats } = req.query as {
            size: string;
            fee: string;
            count?: string;
            rareSats?: string;
        };
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
                select: safeOrderFields,
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
            let { files, rarity, receiverAddress } = req.body as {
                files: FileData[];
                rarity: string;
                receiverAddress: string;
            };

            validateOrderData({
                files,
                rarity,
                receiverAddress,
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
                console.log(orderResponseData);
                //successful order
                //save to the db
                let newOrder = await prisma.order.create({
                    data: {
                        receiver_address: receiverAddress,
                        ordinals_bot_order_id: orderResponseData.id,
                        update_token: orderToken,
                    },
                    select: safeOrderFields,
                });

                for (let file of orderResponseData.files) {
                    const fileData = namedFiles.find((item) =>
                        file.name.includes(item.name)
                    )!;
                    await prisma.orderFile.create({
                        data: {
                            order_id: newOrder.id,
                            name: file.name,
                            size: file.size,
                            hash: await hashFile(fileData.dataURL),
                        },
                    });
                }
                console.log({ newOrder });

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
        // {
        //     id: xxx, => orderId
        //     index: 0, => index of file in the original order request file array
        //     file: {...} => file object for the update
        //     tx: {reveal, inscription, commit} => inscription related transaction data
        // }

        const where = {
            name: payload.file.name,
            order: {
                update_token: token,
                ordinals_bot_order_id: payload.id,
            },
        };

        const existingFile = await prisma.orderFile.findFirst({
            where,
            include: {
                order: true,
            },
        });

        if (!existingFile) {
            throw new ErrorResponse("Invalid order token", 401);
        }

        if (existingFile.transaction_id) {
            throw new ErrorResponse("Order already inscribed", 400);
        }

        const fileTransaction = await prisma.transaction.create({
            data: {
                tx_id: payload.tx.reveal,
            },
        });

        const inscription_index = Number(
            payload.tx.inscription.split("i").pop()
        );
        let update = await prisma.orderFile.update({
            where: {
                id: existingFile.id,
            },
            data: {
                transaction_id: fileTransaction.id,
                inscription_index,
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
    console.log({ date: new Date(), error });
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
