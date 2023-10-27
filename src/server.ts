import { config as loadEnvVars } from "dotenv";

import express from "express";
import type { Request, Response, NextFunction } from "express";

import needle from "needle";
import ErrorResponse from "./lib/error-response";

import prisma from "./lib/prisma-client";
import { available_rarity } from "./constants/rarity";
import { v4 } from "uuid";
import { validateOrderData } from "./lib/validation/orders";
import { Status } from "@prisma/client";
import {
    OrdinalsBotCreateOrderResponse,
    OrdinalsBotErrorResponse,
    OrdinalsBotWebhookPayload,
} from "./types/ordinals-bot";
const app = express();

//load env
loadEnvVars();

const safeOrderFields = {
    address: true,
    created_at: true,
    pid: true,
    status: true,
    id: true,
    transaction_data: true,
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
        let { size, fee, count, rareSats } = req.query;
        let priceResponse = await needle(
            "get",
            `${process.env.ORDINALS_BOT_API_BASE_URL}/price?size=${size}&fee=${fee}&count=${count}`,
            { json: true, headers: { Accept: "application/json" } }
        );

        //possible response
        // {
        //     "status": "ok",
        //     "chainFee": 9458, // chain fee that will be paid to miners
        //     "baseFee": 100000, // base service fee taken by ordinalsbot.com
        //     "serviceFee": 100945, // total service fee taken by ordinalsbot.com
        //     "totalFee": 110403 // total amount to be paid by the user
        // }
        if (priceResponse.body.status === "ok") {
            let fee = priceResponse.body.totalFee;
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
                    address,
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
            let { files, rarity, receiverAddress } = req.body;

            validateOrderData({
                files,
                rarity,
                receiverAddress,
            });

            // unique token for ordinals bot webhook
            const orderToken = v4();
            let data = {
                files,
                receiveAddress: receiverAddress,
                fee: Number(process.env.MINING_FEE),
                rareSats: rarity,
                lowPostage: true,
                // referral: process.env.REFERRAL_CODE
                // additionalFee: proccess.env.REFERRAL_FEE
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
                        address: receiverAddress,
                        pid: orderResponseData.id,
                        update_token: orderToken,
                    },
                    select: safeOrderFields,
                });
                console.log({ newOrder });

                //send response to client
                return res.status(200).json({
                    message: "Inscribe Order pending",
                    data: newOrder,
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

//webhook which receives the inscribe order status
app.post("/inscribe/update-status/:token", async (req, res, next) => {
    //once it gets here
    let payload = req.body as OrdinalsBotWebhookPayload;
    const token = req.params.token;
    // {
    //     id: xxx, => orderId
    //     index: 0, => index of file in the original order request file array
    //     file: {...} => file object for the update
    //     tx: {reveal, inscription, commit} => inscription related transaction data
    // }

    const existingOrder = await prisma.order.findFirst({
        where: {
            update_token: token,
            pid: payload.id,
        },
        select: safeOrderFields,
    });

    if (!existingOrder) {
        throw new ErrorResponse("Invalid order token", 401);
    }

    if (existingOrder.status === Status.INSCRIBED) {
        throw new ErrorResponse("Order already inscribed", 400);
    }

    let update = await prisma.order.update({
        where: {
            pid: payload.id,
        },
        data: {
            status: "INSCRIBED",
        },
        select: safeOrderFields,
    });

    return res.status(200).json({
        message: "Order updated successfully",
        data: update,
        success: true,
    });

    //inscribe the html file with the payload.id
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
    console.log({ date: new Date(), error, req, res, next });
    return res.status(error.statusCode).json({
        message: error.message,
        success: false,
    });
});

if (process.env.NODE_ENV !== "test") {
    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, async () => {
        console.log(`Server has started on http://localhost:${PORT}`);
    }).on("error", async (err) => {
        console.log({ err });
        console.log("FROM ERROR APP EVENT EMITTER");
    });
}

export { app };
