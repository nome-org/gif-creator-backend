import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import prisma from "../lib/prisma-client";
import { Order, OrderStatus } from "@prisma/client";
import { mempool } from "../lib/mempool/socket-client";
import { getAddressByIndex } from "../lib/payments/bitcoin";
import { handlePaidOrder } from "../lib/order-handlers/handle-paid-orders";

const checkAddress = async ({
    address,
    order,
}: {
    address: string;
    order: Order;
}) => {
    const result = await mempool.bitcoin.addresses.getAddressTxsUtxo({
        address,
    });

    const [tx] = result;

    let status: OrderStatus = OrderStatus.PAYMENT_CONFIRMED;
    if (!tx.status.confirmed) {
        status = OrderStatus.PAYMENT_PENDING;
    }

    await prisma.order.update({
        where: {
            id: order.id,
        },
        data: {
            status,
            payment_tx_id: tx.txid,
        },
    });

    if (status === OrderStatus.PAYMENT_CONFIRMED) {
        console.log(`Payment for order ${order.id} confirmed`);
        await handlePaidOrder(order);
    }

    return status;
};

const watchOrderPaymentTransactionsTask = new AsyncTask(
    "Watch unpaid orders transactions",
    async () => {
        const orders = await prisma.order.findMany({
            where: {
                status: {
                    in: [OrderStatus.UNPAID, OrderStatus.PAYMENT_PENDING],
                },
            },
        });

        for (const order of orders) {
            await checkAddress({
                address: (await getAddressByIndex(order.id)) as string,
                order,
            });
        }
    }
);

export const watchOrderPaymentTransactionsJob = new SimpleIntervalJob(
    {
        minutes: 3,
        // seconds: 10,
    },
    watchOrderPaymentTransactionsTask,
    {
        preventOverrun: true,
    }
);
