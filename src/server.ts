import { config as loadEnvVars } from "dotenv";

import express from "express";
import type {Request, Response, NextFunction} from "express";

import needle from "needle";
import ErrorResponse from "./lib/error-response";

import prisma from "./lib/prisma-client";
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

const buildOrdinalsBotError = (
    body:
        | {
              status: "error";
              error: string;
              reason: never;
          }
        | {
              status: "error";
              error: never;
              reason: string;
          }
) => {
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

app.get("/:address/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
        //first get the user address
        let address = req.params.address;

        //then check if the user has an order already and send back those details
        let orders = await prisma.order.findMany({
            where: {
                address,
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
});

app.post("/inscribe", async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { files, rarity, receiverAddress } = req.body;

        if (!files.length) {
            throw new ErrorResponse("No files provided", 400);
        }

        if (!receiverAddress) {
            throw new ErrorResponse("No receiver address provided", 400);
        }

        if (!available_rarity.includes(rarity)) {
            throw new ErrorResponse("Invalid rarity provided", 400);
        }
        // check if files are valid format
        const areFilesValid = files.every((file: any) => {
            return (
                file.name &&
                file.type &&
                file.dataURL &&
                file.size &&
                file.size <= 5000000
            );
        });

        if (!areFilesValid) {
            throw new ErrorResponse("Invalid file format", 400);
        }

        let data = {
            files,
            receiveAddress: receiverAddress,
            fee: process.env.MINING_FEE,
            rareSats: rarity,
            lowPostage: true,
            // referral: process.env.REFERRAL_CODE
            // additionalFee: proccess.env.REFERRAL_FEE
            webhookUrl: `https://...../inscribe/update-status`,
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
        if (orderResponse.body.status === "ok") {
            //successful order
            //save to the db
            let newOrder = await prisma.order.create({
                data: {
                    address: receiverAddress,
                    pid: orderResponse.body.charge.id,
                },
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
        throw buildOrdinalsBotError(orderResponse.body);

        //success response
        // let re = {
        //     status: 'ok',
        //     // ..., // input parameters
        //     charge: {
        //         "id": "815xxx-xxx-xxx-xxx79",
        //         "address": "3P...Vu",
        //         "amount": 1218725,
        //         "lightning_invoice": {
        //             "expires_at": 1675786558,
        //             "payreq": "lnbc1218...7qz9v"
        //         },
        //         "created_at": 1677176476,
        //     },
        //     chainFee: 718725, // in satoshis
        //     serviceFee: 100000, // in satoshis
        //     orderType: 'bulk',
        //     createdAt: 1675785959855, // timestamp in ms,
        // }
        // console.log({res, re});
    } catch (e) {
        next(e);
    }
});

//webhook which receives the inscribe order status
app.post("/inscribe/update-status", async (req, res, next) => {
    //once it gets here
    let payload = req.body;
    // {
    //     id: xxx, => orderId
    //     index: 0, => index of file in the original order request file array
    //     file: {...} => file object for the update
    //     tx: {reveal, inscription, commit} => inscription related transaction data
    // }

    //update receiverwallet address
    let data = {
        orderId: payload.id,
        address: "",
    };
    let response = await needle(
        "post",
        `${process.env.ORDINALS_BOT_API_BASE_URL}/address`,
        data,
        { json: true, headers: { Accept: "application/json" } }
    );
    if (response.body.status === "ok") {
        //successfully done
        //update user order
        let update = await prisma.order.update({
            where: {
                pid: payload.id,
            },
            data: {
                // pid: payload.id,
                status: "INSCRIBED",
            },
        });

        //inscribe the html file with the payload.id
    } else {
        throw buildOrdinalsBotError(response.body);
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
    console.log({date: new Date(), error, req, res, next });
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
