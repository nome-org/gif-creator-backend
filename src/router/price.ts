import { defaultEndpointsFactory } from "express-zod-api";
import { available_rarity } from "../constants/rarity";
import z from "zod";
import { calculatePrice } from "../lib/calculatePrice";

export const getPriceEndpoint = defaultEndpointsFactory.build({
    method: "get",
    input: z.object({
        imageSizes: z
            .array(z.string().transform(Number))
            .refine((x) => x.every((y) => y > 0)),
        fee_rate: z
            .string()
            .transform(Number)
            .refine((x) => x > 0),
        count: z.string().default("1").transform(Number),
        rareSats: z.string(z.enum(available_rarity)).default("random"),
    }),
    output: z.object({
        totalFee: z.number(),
    }),
    handler: async ({ input: { imageSizes, fee_rate, count, rareSats } }) => {
        const feeDetails = await calculatePrice({
            fee: fee_rate,
            imageFileSizes: imageSizes,
            quantity: count,
            rareSats,
        });
        return {
            totalFee: feeDetails.totalFee,
        };
    },
});
