import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import prisma from "../lib/prisma-client";
import { OrderStatus, TransactionStatus } from "@prisma/client";
import needle from "needle";
import { MempoolTx } from "../types/mempool";

const checkTx = async (txId: string) => {
    const result = await needle(
        "get",
        `${process.env.MEMPOOL_BASE_URL}/tx/${txId}`
    );
    const tx = result.body as MempoolTx;

    if (tx.status.confirmed) {
        await prisma.order.update({
            where: {
                payment_tx_id: txId,
            },
            data: {
                status: OrderStatus.PAYMENT_CONFIRMED,
            },
        });
    }
};

const watchPaymentTransactionsTask = new AsyncTask(
    "Watch unconfirmed transactions",
    async () => {
        const unconfirmedTxs = await prisma.order.findMany({
            where: {
                status: OrderStatus.PAYMENT_PENDING,
                payment_tx_id: {
                    not: null,
                },
            },
        });

        for (const tx of unconfirmedTxs) {
            checkTx(tx.payment_tx_id!);
        }
    }
);

export const watchPaymentTransactionsJob = new SimpleIntervalJob(
    {
        minutes: 3,
    },
    watchPaymentTransactionsTask
);
