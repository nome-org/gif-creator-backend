import { DependsOnMethod, Routing } from "express-zod-api";
import { getOrdersEndpoint } from "./orders";
import { getPriceEndpoint } from "./price";
import { createOrderEndpoint } from "./create-order";
import { updateOrderWebhook } from "./update-order-webhook";

export const routing: Routing = {
    orders: {
        "": new DependsOnMethod({
            get: getOrdersEndpoint,
            post: createOrderEndpoint,
        }),
        ":token": updateOrderWebhook,
    },
    price: getPriceEndpoint,
};
