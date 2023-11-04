import { defaultEndpointsFactory } from "express-zod-api";
import { z } from "zod";
import prisma from "../lib/prisma-client";
import { getAddressByIndex } from "../lib/payments/server-keys";
import { OrderStatus } from "@prisma/client";

export const getOrdersEndpoint = defaultEndpointsFactory.build({
    method: "get",
    input: z.object({
        address: z.string(),
        page: z.number().optional(),
    }),
    output: z.object({
        data: z.array(
            z.object({
                receiver_address: z.string(),
                created_at: z.date(),
                id: z.number(),
                updated_at: z.date(),
                status: z.enum([
                    OrderStatus.PAYMENT_PENDING,
                    OrderStatus.HTML_ORDINALS_PENDING,
                    OrderStatus.IMAGE_ORDINALS_PENDING,
                    OrderStatus.UNPAID,
                    OrderStatus.READY,
                ]),
                quantity: z.number(),
                total_fee: z.number(),
                payment_tx_id: z.string().optional(),
                payment_details: z.object({
                    address: z.string(),
                    amount: z.number(),
                }),
            })
        ),
        total: z.number(),
    }),
    handler: async ({ input: { address, page } }) => {
        //first get the user address

        //then check if the user has an order already and send back those details
        const orders = await prisma.order.findMany({
            where: {
                receiver_address: address,
            },
            select: {
                receiver_address: true,
                created_at: true,
                id: true,
                updated_at: true,
                status: true,
                quantity: true,
                total_fee: true,
            },
            take: 10,
            skip: page ? page * 10 : 0,
        });

        const total = await prisma.order.count({
            where: {
                receiver_address: address,
            },
        });

        return {
            data: await Promise.all(
                orders.map(async (order) => ({
                    ...order,
                    payment_details: {
                        address: (await getAddressByIndex(order.id))!,
                        amount: order.total_fee,
                    },
                }))
            ),
            total,
        };
    },
});
