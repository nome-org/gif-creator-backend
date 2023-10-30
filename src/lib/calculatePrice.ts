import needle from "needle";
import { buildGifHTMLMini } from "./gif/build-html";
import { FileData } from "./validation/orders";

import { TransactionStatus } from "@prisma/client";
import { buildOrdinalsBotError } from "./error-response";
import { OrdinalsBotErrorResponse } from "../types/ordinals-bot";

export type ordinalsBotPriceRes = {
    chainFee: number;
    serviceFee: number;
    baseFee: number;
    rareSatsFee: number;
    additionalFee: number;
    postage: number;
    amount: number;
    totalFee: number;
    status: never;
};

export const getOrdinalsBotPrice = async ({
    size,
    fee,
    quantity = 1,
    rareSats = "random",
}: {
    size: number;
    fee: number;
    quantity?: number;
    rareSats?: string;
}) => {
    const searchParams = new URLSearchParams({
        size: String(size),
        fee: String(fee),
        count: String(quantity),
        rareSats: rareSats,
    });

    const res = await needle(
        "get",
        `${process.env.ORDINALS_BOT_API_BASE_URL}/price?${searchParams}`,
        { json: true, headers: { Accept: "application/json" } }
    );
    const priceData: ordinalsBotPriceRes = res.body;
    const errorData: OrdinalsBotErrorResponse = res.body;
    if (errorData.status === "error") {
        throw buildOrdinalsBotError(errorData as OrdinalsBotErrorResponse);
    } else {
        return priceData;
    }
};

export const calculatePrice = async ({
    fee,
    quantity = 1,
    rareSats,
    imageFileSizes,
}: {
    fee: number;
    quantity?: number;
    rareSats?: string;
    imageFileSizes: number[];
}) => {
    const mappedFiles = imageFileSizes.map(() => ({
        id: 12412,
        created_at: new Date(),
        updated_at: new Date(),
        duration: 19999,
        name: "c988941e55591e7b5930f6cc1d8d5046f5458a1c2641c29ae43f2a37359e57c5.webp",
        hash: "c988941e55591e7b5930f6cc1d8d5046f5458a1c2641c29ae43f2a37359e57c5",
        html_files_order_id: 1,
        image_files_order_id: 1,
        ordinal_index: 1,
        size: 20_000,
        tx_id: "tx_id",
        tx_status: TransactionStatus.PENDING,
        type: "image/webp",
        ordinals_bot_order_id:
            "c988941e55591e7b5930f6cc1d8d5046f5458a1c2641c29ae43f2a37359e57c5",
    }));
    const htmlSize = buildGifHTMLMini("image.gif", mappedFiles).length;
    let totalImagesPrice = 0;
    for (const imageSize of imageFileSizes) {
        const { totalFee } = await getOrdinalsBotPrice({
            size: imageSize,
            fee,
            rareSats,
        });
        totalImagesPrice += totalFee;
    }

    const { totalFee: htmlPrice } = await getOrdinalsBotPrice({
        size: htmlSize,
        fee,
        rareSats,
    });

    const serviceFee = Number(process.env.REFERRAL_FEE);
    const totalFee = serviceFee + totalImagesPrice + htmlPrice * quantity;

    return {
        totalFee,
        totalImagesPrice,
        htmlPrice,
        htmlSize,
    };
};
