import { mempool } from "../mempool/mempool-client";
import { determineUtxosForSpend } from "./coin-selection";
import { getUTXOsByIndex } from "../mempool/getUTXOByIndex";
import { getKeyByIndex } from "./server-keys";
import { networkMode } from "./network";

export const buildPaymentTx = async ({
    keyIndex,
    amount,
    receiverAddress,
    feeRate,
}: {
    keyIndex: number;
    amount: number;
    receiverAddress: string;
    feeRate: number;
}) => {
    console.log("just started fuck");
    const key = getKeyByIndex(keyIndex);
    const btc = await import("@scure/btc-signer");
    const tx = new btc.Transaction();
    const [utxo] = await getUTXOsByIndex(keyIndex);

    console.log({ utxo });
    // const isSendingMax = utxo.value < amount;

    // const recommendedFee = await mempool.bitcoin.fees.getFeesRecommended();

    const determineUtxosArgs = {
        amount,
        feeRate,
        recipient: receiverAddress,
        utxos: [utxo],
    };

    const { inputs, outputs, fee } = determineUtxosForSpend(determineUtxosArgs);

    console.log({ inputs, outputs, fee });
    if (!inputs.length) throw new Error("No inputs to sign");
    if (!outputs.length) throw new Error("No outputs to sign");

    if (outputs.length > 2)
        throw new Error("Address reuse mode: wallet should have max 2 outputs");

    inputs.forEach((input) => {
        const p2wpkh = btc.p2wpkh(key.publicKey!, networkMode);

        tx.addInput({
            txid: input.txid,
            index: input.vout,
            sequence: 0,
            witnessUtxo: {
                // script = 0014 + pubKeyHash
                script: p2wpkh.script,
                amount: BigInt(input.value),
            },
        });
    });
    outputs.forEach((output) => {
        // When coin selection returns output with no address we assume it is
        // a change output
        if (!output.address) {
            tx.addOutputAddress(
                btc.getAddress("wpkh", key.privateKey!, networkMode)!,
                BigInt(output.value),
                networkMode
            );
            return;
        }
        tx.addOutputAddress(output.address, BigInt(output.value), networkMode);
    });

    tx.sign(key.privateKey!);
    tx.finalize();

    return { hex: tx.hex, fee };
};

export const broadcastPaymentTx = async ({ hex }: { hex: string }) => {
    const res = mempool.bitcoin.transactions.postTx({ txhex: hex });
    console.log("mempool tx res", res);
    return res;
};
