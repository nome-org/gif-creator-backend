import { ToadScheduler } from "toad-scheduler";
import { watchOrdinalTransactionsJob } from "./watch-ordinal-transactions";
import { watchPaymentTransactionsJob } from "./watch-payment-transactions";

export const toadScheduler = new ToadScheduler();

toadScheduler.addSimpleIntervalJob(watchOrdinalTransactionsJob);
toadScheduler.addSimpleIntervalJob(watchPaymentTransactionsJob);
