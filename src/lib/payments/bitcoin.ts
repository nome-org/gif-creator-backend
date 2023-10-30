import { HDKey, Versions } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { mempool } from "../mempool/socket-client";
import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";
import { getAddressInfo } from "bitcoin-address-validation";
import { BtcSizeFeeEstimator } from "./btc-size-fee-estimator";
import { validate } from "bitcoin-address-validation";
export const BTC_P2WPKH_DUST_AMOUNT = 294;

const bitcoinMainnet = {
    bech32: "bc",
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80,
};

const bitcoinTestnet = {
    bech32: "tb",
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
};

const networkMode =
    process.env.NODE_ENV === "production" ? bitcoinMainnet : bitcoinTestnet;

const getHDKey = () => {
    const mnemonic = process.env.PAYMENT_MNEMONIC!;

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    return HDKey.fromMasterSeed(seed);
};

const getDerivationPath = (keyIndex: number) => {
    let accountIndex = 0;
    if (keyIndex > 209_496_7296) {
        accountIndex = Math.floor(keyIndex / 209_496_7296);
    }
    return `m/84'/0'/${accountIndex}'`;
};

export const getKeyByIndex = (keyIndex: number) => {
    const hdKey = getHDKey();
    const derivationPath = getDerivationPath(keyIndex);
    return hdKey.derive(derivationPath).deriveChild(0).deriveChild(keyIndex);
};

export const getAddressByIndex = async (keyIndex: number) => {
    const key = getKeyByIndex(keyIndex);
    const btcSigner = await import("@scure/btc-signer");
    return btcSigner.getAddress("wpkh", key.privateKey!, networkMode);
};

export const getUTXOsByIndex = async (keyIndex: number) => {
    const address = await getAddressByIndex(keyIndex);
    return mempool.bitcoin.addresses.getAddressTxsUtxo({ address: address! });
};
export function determineUtxosForSpendAll({
    amount,
    feeRate,
    recipient,
    utxos,
}: {
    amount: number;
    feeRate: number;
    recipient: string;
    utxos: AddressTxsUtxo[];
}) {
    if (!validate(recipient))
        throw new Error("Cannot calculate spend of invalid address type");

    const addressInfo = getAddressInfo(recipient);

    const txSizer = new BtcSizeFeeEstimator();

    const sizeInfo = txSizer.calcTxSize({
        input_script: "p2wpkh",
        input_count: utxos.length,
        [addressInfo.type + "_output_count"]: 1,
    });

    // Fee has already been deducted from the amount with send all
    const outputs = [{ value: BigInt(amount), address: recipient }];

    const fee = Math.ceil(sizeInfo.txVBytes * feeRate);

    return {
        utxos,
        inputs: utxos,
        outputs,
        size: sizeInfo.txVBytes,
        fee,
    };
}
export function determineUtxosForSpend({
    amount,
    feeRate,
    recipient,
    utxos,
}: {
    amount: number;
    feeRate: number;
    recipient: string;
    utxos: AddressTxsUtxo[];
}) {
    if (!validate(recipient))
        throw new Error("Cannot calculate spend of invalid address type");

    const addressInfo = getAddressInfo(recipient);

    const orderedUtxos = utxos
        .filter((utxo) => utxo.value >= BTC_P2WPKH_DUST_AMOUNT)
        .sort((a, b) => b.value - a.value);

    const txSizer = new BtcSizeFeeEstimator();

    const neededUtxos = [];
    let sum = BigInt(0);
    let sizeInfo = null;

    for (const utxo of orderedUtxos) {
        sizeInfo = txSizer.calcTxSize({
            // Only p2wpkh is supported by the wallet
            input_script: "p2wpkh",
            input_count: neededUtxos.length,
            // From the address of the recipient, we infer the output type
            [addressInfo.type + "_output_count"]: 2,
        });
        if (
            sum >=
            BigInt(amount) + BigInt(Math.ceil(sizeInfo.txVBytes * feeRate))
        )
            break;

        sum += BigInt(utxo.value);
        neededUtxos.push(utxo);
    }

    if (!sizeInfo) throw new Error("Transaction size must be defined");

    const fee = Math.ceil(sizeInfo.txVBytes * feeRate);

    const outputs = [
        // outputs[0] = the desired amount going to recipient
        { value: BigInt(amount), address: recipient },
        // outputs[1] = the remainder to be returned to a change address
        { value: sum - BigInt(amount) - BigInt(fee) },
    ];

    return {
        orderedUtxos,
        inputs: neededUtxos,
        outputs,
        size: sizeInfo.txVBytes,
        fee,
    };
}

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
    const key = getKeyByIndex(keyIndex);
    const btc = await import("@scure/btc-signer");
    const tx = new btc.Transaction();
    const [utxo] = await getUTXOsByIndex(keyIndex);

    // const isSendingMax = utxo.value < amount;

    const recommendedFee = await mempool.bitcoin.fees.getFeesRecommended();

    const determineUtxosArgs = {
        amount,
        feeRate: recommendedFee.fastestFee,
        recipient: receiverAddress,
        utxos: [utxo],
    };

    const { inputs, outputs, fee } = determineUtxosForSpend(determineUtxosArgs);

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
