import { config as loadEnvVars } from "dotenv";

import express from "express";
import type { Request, Response, NextFunction } from "express";

import ErrorResponse from "./lib/error-response";

import prisma from "./lib/prisma-client";
import { FileData, validateOrderData } from "./lib/validation/orders";

import { OrdinalsBotWebhookPayload } from "./types/ordinals-bot";

import { toadScheduler } from "./scheduler/toad";
import { available_rarity } from "./constants/rarity";
import { calculatePrice } from "./lib/calculatePrice";

import { v4 } from "uuid";
import { ordinalsBotInscribe } from "./lib/ordinals-bot/inscribe";
import { hashFile } from "./lib/hashfile";
import { getAddressByIndex } from "./lib/payments/server-keys";
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
        const {
            imageSizes,
            fee: fee_rate,
            count,
            rareSats,
        } = req.query as {
            imageSizes: string[];
            fee: string;
            count?: string;
            rareSats?: string;
        };
        if (!imageSizes.length || !fee_rate) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (
            imageSizes.every(
                (size) => isNaN(Number(size)) || Number(size) < 1
            ) ||
            isNaN(Number(fee_rate))
        ) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (Number(fee_rate) < 1) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (count && isNaN(Number(count))) {
            throw new ErrorResponse("Invalid query params", 400);
        }
        if (rareSats && !available_rarity.includes(rareSats)) {
            throw new ErrorResponse("Invalid query params", 400);
        }

        const totalFee = await calculatePrice({
            fee: Number(fee_rate),
            imageFileSizes: imageSizes.map(Number),
            quantity: Number(count),
            rareSats,
        });
        return res.status(200).json({
            message: "Price calculated",
            data: totalFee,
            success: true,
        });
    } catch (e) {
        next(e);
    }
});

app.get("/orders", async (req: Request, res: Response, next: NextFunction) => {
    try {
        //first get the user address
        const address = req.params.address;

        //then check if the user has an order already and send back those details
        const orders = await prisma.order.findMany({
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
                total_fee: true,
                html_ordinals: true,
                payment_tx_id: true,
            },
        });

        return res.status(200).json({
            message: "Orders fetched successfully",
            data: await Promise.all(
                orders.map(async (order) => ({
                    ...order,
                    payment_details: {
                        address: await getAddressByIndex(order.id),
                        amount: order.total_fee,
                    },
                }))
            ),
            success: true,
        });
    } catch (e) {
        next(e);
    }
});

app.post(
    "/inscribe",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const {
                files,
                rarity,
                receiverAddress,
                quantity,
                payAddress,
                feeRate,
            } = req.body as {
                files: FileData[];
                rarity: string;
                receiverAddress: string;
                payAddress: string;
                quantity?: number;
                feeRate: number;
            };

            validateOrderData({
                files,
                rarity,
                receiverAddress,
                quantity,
                payAddress,
            });

            const namedFiles = files.map((file) => ({
                ...file,
                name: `${v4()}.${file.name.split(".").pop()}`,
            }));

            const detailed_fees = await calculatePrice({
                fee: feeRate,
                imageFileSizes: files.map((file) => file.size),
                quantity,
                rareSats: rarity,
            });
            //successful order
            //save to the db
            const orderToken = v4();

            const orderResponseData = await ordinalsBotInscribe({
                files: namedFiles,
                order: {
                    fee_rate: feeRate,
                    rarity,
                    receiver_address: receiverAddress,
                    update_token: orderToken,
                },
            });

            const newOrder = await prisma.order.create({
                data: {
                    receiver_address: receiverAddress,
                    update_token: orderToken,
                    fee_rate: feeRate,
                    quantity: quantity || 1,
                    rarity,
                    total_fee: detailed_fees.totalFee,
                },
            });
            for (const file of namedFiles) {
                await prisma.ordinal.create({
                    data: {
                        image_files_order_id: newOrder.id,
                        name: file.name,
                        size: file.size,
                        hash: await hashFile(file.dataURL),
                        duration: file.duration,
                        type: file.type,
                        ordinals_bot_order_id: orderResponseData.id,
                    },
                });
            }
            //send response to client
            return res.status(200).json({
                message: "Inscribe Order pending",
                data: {
                    id: newOrder.id,
                    payment_details: {
                        address: await getAddressByIndex(newOrder.id),
                        amount: detailed_fees.totalFee,
                    },
                },
                success: true,
            });
            //an error occurred
        } catch (e) {
            next(e);
        }
    }
);

//webhook which receives the file inscription status
app.post("/inscribe/update-status/:token", async (req, res, next) => {
    try {
        //once it gets here
        const payload = req.body as OrdinalsBotWebhookPayload;
        const token = req.params.token;

        if (!token) {
            throw new ErrorResponse("Invalid order token", 401);
        }

        const existingFile = await prisma.ordinal.findFirst({
            where: {
                name: payload.file.name,
                ordinals_bot_order_id: payload.id,
                OR: [
                    {
                        image_files_order: {
                            update_token: token,
                        },
                    },
                    {
                        html_files_order: {
                            update_token: token,
                        },
                    },
                ],
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- next is required by express
    _next: NextFunction
) {
    if (process.env.NODE_ENV !== "test") {
        // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.log(`Server has started on http://localhost:${PORT}`);
    })
        .on("error", async (err) => {
            // eslint-disable-next-line no-console
            console.log({ err });
            // eslint-disable-next-line no-console
            console.log("FROM ERROR APP EVENT EMITTER");
        })
        .on("close", async () => {
            toadScheduler.stop();
        });
}

export { app };
