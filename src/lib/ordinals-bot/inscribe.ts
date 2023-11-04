import needle from "needle";
import { FileData } from "../validation/orders";
import {
    OrdinalsBotCreateOrderResponse,
    OrdinalsBotErrorResponse,
} from "../../types/ordinals-bot";
import { buildOrdinalsBotError } from "../error-response";

export const ordinalsBotInscribe = async ({
    files,
    order,
}: {
    files: FileData[];
    order: {
        fee_rate: number;
        rarity: string;
        receiver_address: string;
        update_token: string;
    };
}) => {
    // unique token for ordinals bot webhook
    const data = {
        files,
        receiveAddress: order.receiver_address,
        fee: order.fee_rate,
        rareSats: order.rarity,
        lowPostage: true,
        webhookUrl: `${process.env.BASE_URL}/${order.update_token}`,
    };
    const orderResponse = await needle(
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
