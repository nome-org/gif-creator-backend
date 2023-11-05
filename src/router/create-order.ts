import { defaultEndpointsFactory } from "express-zod-api";
import { v4 } from "uuid";
import z from "zod";
import { calculatePrice } from "../lib/calculatePrice";
import { ordinalsBotInscribe } from "../lib/ordinals-bot/inscribe";
import { hashFile } from "../lib/hashfile";
import prisma from "../lib/prisma-client";
import { getAddressByIndex } from "../lib/payments/server-keys";
import { available_rarity } from "../constants/rarity";
import { safeInt } from "../types/zod-extras";

const fileData = z.object({
    name: z.string(),
    size: safeInt,
    dataURL: z.string(),
    duration: safeInt,
    type: z.string(),
});

export const createOrderEndpoint = defaultEndpointsFactory.build({
    method: "post",
    input: z.object({
        files: z.array(fileData).min(1).nonempty(),
        rarity: z.enum(available_rarity).default("random"),
        receiverAddress: z.string(),
        quantity: safeInt.default(1),
        feeRate: safeInt,
    }),
    output: z.object({
        id: safeInt,
        payment_details: z.object({
            address: z.string(),
            amount: safeInt,
        }),
    }),
    handler: async ({
        input: { files, rarity, receiverAddress, quantity, feeRate },
    }) => {
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
        return {
            id: newOrder.id,
            payment_details: {
                address: (await getAddressByIndex(newOrder.id))!,
                amount: detailed_fees.totalFee,
            },
        };
    },
});
