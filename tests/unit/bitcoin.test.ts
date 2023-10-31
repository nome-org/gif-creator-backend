import { wordlist } from "@scure/bip39/wordlists/english";

import { generateMnemonic } from "@scure/bip39";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUTXOsByIndex } from "../../src/lib/mempool/getUTXOByIndex";

vi.doMock("../../src/lib/mempool/getUTXOByIndex", () => {
    return {
        getUTXOsByIndex: vi
            .fn()
            .mockImplementation(getUTXOsByIndex)
            .mockReturnValueOnce(
                Promise.resolve([
                    {
                        txid: "b40c08d629c55d384511aed9ce475063336c444bcbee1ea0ecc82fa601e9ee96",
                        vout: 0,
                        value: 79470,
                        status: {
                            confirmed: true,
                            block_height: 123456,
                            block_hash: "abcdef1234567890",
                            block_time: 1234567890,
                        },
                    },
                ])
            ),
    };
});
vi.mock("../../src/lib/mempool/socket-client");
const mockMnemonic = generateMnemonic(wordlist);
vi.stubEnv("PAYMENT_MNEMONIC", mockMnemonic);

describe("buildPaymentTx", () => {
    const mockArgs = {
        keyIndex: 0,
        amount: 62_412,
        receiverAddress: "2NAVZVdwCV1NSf72mhHpcUqPwMECu3uEZUy",
        feeRate: 5.82,
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("should build a payment transaction with the expected inputs, outputs, and fee", async () => {
        const { buildPaymentTx } = await import(
            "../../src/lib/payments/bitcoin"
        );
        const { hex, fee } = await buildPaymentTx(mockArgs);

        expect(hex).toBeDefined();
        expect(fee).toEqual(830);
    });
});
