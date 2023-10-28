import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import prisma from "../lib/prisma-client";
import { TransactionStatus } from "@prisma/client";
import needle from "needle";
import { MempoolTx } from "../types/mempool";

const checkTx = async (txId: string) => {
    const result = await needle(
        "get",
        `${process.env.MEMPOOL_BASE_URL}/tx/${txId}`
    );
    const tx = result.body as MempoolTx;

    if (tx.status.confirmed) {
        await prisma.transaction.update({
            where: {
                tx_id: txId,
            },
            data: {
                status: TransactionStatus.CONFIRMED,
            },
        });
    }
};

const watchTxsTask = new AsyncTask(
    "Watch unconfirmed transactions",
    async () => {
        const unconfirmedTxs = await prisma.transaction.findMany({
            where: {
                status: TransactionStatus.PENDING,
            },
        });

        for (const tx of unconfirmedTxs) {
            checkTx(tx.tx_id);
        }
    }
);

export const watchTxsJob = new SimpleIntervalJob(
    {
        minutes: 3,
    },
    watchTxsTask
);
