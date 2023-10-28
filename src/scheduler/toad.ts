import { ToadScheduler } from "toad-scheduler";
import { watchTxsJob } from "./watch-txs";

export const toadScheduler = new ToadScheduler();

toadScheduler.addSimpleIntervalJob(watchTxsJob);
