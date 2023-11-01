import { Order, OrderStatus } from "@prisma/client";
import prisma from "../prisma-client";
import {
    OrdinalsBotCreateOrderResponse,
    OrdinalsBotErrorResponse,
} from "../../types/ordinals-bot";
import needle from "needle";
import { broadcastPaymentTx, buildPaymentTx } from "../payments/bitcoin";
import { buildOrdinalsBotError } from "../error-response";

export const handlePaidOrder = async (order: Order) => {
    const imageOrdinal = await prisma.ordinal.findFirst({
        where: {
            image_files_order_id: order.id,
        },
    });

    const ordinalsBotOrder = await needle(
        "get",
        `${process.env.ORDINALS_BOT_API_BASE_URL}/order?id=${
            imageOrdinal!.ordinals_bot_order_id
        }`
    );

    const ordinalsBotOrderData = ordinalsBotOrder.body as
        | OrdinalsBotCreateOrderResponse
        | OrdinalsBotErrorResponse;

    if (ordinalsBotOrderData.status === "ok") {
        console.log(
            `sending ${ordinalsBotOrderData.charge.amount} to ${ordinalsBotOrderData.charge.address}`
        );
        const { hex } = await buildPaymentTx({
            keyIndex: order.id,
            amount: ordinalsBotOrderData.charge.amount,
            feeRate: order.fee_rate,
            receiverAddress: ordinalsBotOrderData.charge.address,
        });
        await broadcastPaymentTx({ hex });
        await prisma.order.update({
            where: {
                id: order.id,
            },
            data: {
                status: OrderStatus.IMAGE_ORDINALS_PENDING,
                payment_tx_id: hex,
            },
        });
    } else {
        throw buildOrdinalsBotError(ordinalsBotOrderData);
    }
};

// export const handlePaidOrders = async () => {
//     const paidOrders = await prisma.order.findMany({
//         where: {
//             status: OrderStatus.PAYMENT_CONFIRMED,
//         },
//     });

//     for (const order of paidOrders) {
//         handlePaidOrders(order)
//     }
// };
