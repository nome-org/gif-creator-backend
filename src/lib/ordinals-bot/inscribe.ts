import needle from "needle";
import { v4 } from "uuid";
import { FileData } from "../validation/orders";
import {
    OrdinalsBotCreateOrderResponse,
    OrdinalsBotErrorResponse,
} from "../../types/ordinals-bot";
import prisma from "../prisma-client";
import { buildOrdinalsBotError } from "../error-response";
import { hashFile } from "../hashfile";
import { broadcastPaymentTx, buildPaymentTx } from "../payments/bitcoin";
import { Order } from "@prisma/client";

export const ordinalsBotInscribe = async ({
    files,
    order,
}: {
    files: FileData[];
    order: Order;
}) => {
    // unique token for ordinals bot webhook
    let data = {
        files,
        receiveAddress: order.receiver_address,
        fee: order.fee_rate,
        rareSats: order.rarity,
        lowPostage: true,
        webhookUrl: `${process.env.BASE_URL}/inscribe/update-status/${order.update_token}`,
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
        return orderResponseData;
    } else {
        throw buildOrdinalsBotError(orderResponseData);
    }
};
