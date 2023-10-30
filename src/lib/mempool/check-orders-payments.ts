import { OrderStatus } from "@prisma/client";
import prisma from "../prisma-client";

export const checkUnPaidOrders = async () => {
    const unpaidOrders = await prisma.order.findMany({
        where: {
            status: OrderStatus.UNPAID,
        },
    });
};
