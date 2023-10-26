const http = require("http");

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const needle = require("needle");

const app = express();
const prisma = new PrismaClient();

//load env
require("./lib/getenv")();

app.use(express.json());
//cors
app.use((_, res, next) => {
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Credentials", true);
    res.setHeader("Access-Control-Allow-Max-Age", 24 * 60 * 60);
    next();
});

//prepare local server
const server = http.createServer(app);

app.get("/price", async (req, res, next) => {
    try {
        let { size, fee, count, rareSats } = req.query;
        let res = await needle.get(
            `https://api.ordinalsbot.com/price?size=${size}&fee=${fee}&count=${count}`,
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
        if (res.status === "ok") {
            let fee = res.totalFee;
            return res.status(200).json({
                message: "Price calculated",
                data: {
                    fee,
                },
                success: true,
            });
        } else {
            let e = new Error(res.error);
            e.status = 500;
            throw e;
        }
    } catch (e) {
        next(e);
    }
});

app.get("/:address/status", async (req, res, next) => {
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

app.post("/inscribe", async (req, res, next) => {
    try {
        let { files, qty, rarity, receiverAddress } = req.body;
        //common values for rarity
        let available_rarity = [
            "2009",
            "2010",
            "2011",
            "block78",
            "pizza",
            "uncommon",
            "black",
            "vintage",
            "random",
        ];

        let data = {
            files: [],
            receiveAddress: receiverAddress,
            fee: process.env.MINING_FEE,
            rareSats: rarity,
            lowPostage: true,
            // referral: process.env.REFERRAL_CODE
            // additionalFee: proccess.env.REFERRAL_FEE
            webhookUrl: `https://...../inscribe/update-status`,
        };
        let res = await needle.post("https://api.ordinalsbot.com/order", data, {
            json: true,
            headers: { Accept: "application/json" },
        });
        if (res?.status === "ok") {
            //successful order
            //save to the db
            let newOrder = await prisma.order.create({
                data: {
                    address: receiverAddress,
                },
            });
            console.log({ newOrder });

            //send response to client
            return res.status(201).json({
                message: "Inscribe Order pending",
                data: newOrder,
                success: true,
            });
        }
        //an error occurred
        let e = new Error(res.error);
        e.status = 500;
        throw e;

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
    let response = await needle.post(
        "https://api.ordinalsbot.com/address",
        data,
        { json: true, headers: { Accept: "application/json" } }
    );
    if (response.status === "ok") {
        //successfully done
        //update user order
        let update = await prisma.order.update({
            where: {
                address: "",
            },
            data: {
                pid: payload.id,
                status: "INSCRIBED",
            },
        });

        //inscribe the html file with the payload.id
    } else {
        let e = new Error(response.error);
        e.status = 500;
        throw e;
    }
});

//wayward route handler
app.use("*", (req, res, next) => {
    let e = new Error("Page not found.\n Invalid API Route");
    e.status = 404;
    next(e);
});

//general error handler
app.use((error, req, res, next) => {
    return res.status(error.status).json({
        message: error.message,
        success: false,
    });
});

server.on("error", async (err) => {
    console.log({ err });
    console.log("FROM ERROR SERVER EVENT EMITTER");
    await prisma.$disconnect();
});

server.listen(process.env.PORT, process.env.HOST, async () => {
    await prisma.$connect();
    console.log(
        `Server has started on http://${server.address().address}:${
            server.address().port
        }`
    );
});
