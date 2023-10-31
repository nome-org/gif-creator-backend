import { app } from "../../src/server";
import supertest from "supertest";
import { prismaMock } from "../prisma-singleton";
import { hashFile } from "../../src/lib/hashfile";
import { OrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const requestWithSupertest = supertest(app);

vi.mock("needle", () => ({
    default: vi.fn((method, url, body, opts) => {
        if (url.includes("price")) {
            return {
                status: 200,
                body: {
                    chainFee: 100,
                    serviceFee: 100,
                    baseFee: 100,
                    rareSatsFee: 100,
                    additionalFee: 100,
                    postage: 100,
                    amount: 100,
                    totalFee: 100,
                    status: "ok",
                },
            };
        }
        return {
            status: 200,
            body: {
                status: "ok",
                id: "463e6582-d58c-4040-be7c-e5faa72cfa24",
                charge: {
                    id: "123456789",
                },
                files: body.files,
            },
        };
    }),
}));

describe("Orders Endpoints", () => {
    it("POST /inscribe should create an order", async () => {
        prismaMock.order.create.mockResolvedValueOnce({
            id: 1,
            created_at: new Date(),
            updated_at: new Date(),
            ordinals_bot_order_id: "2143",
            receiver_address: "afadf",
            update_token: "4124",
            quantity: 1,
            status: OrderStatus.UNPAID,
            payment_tx_id: "0x123456789",
            total_fee: 100,
            fee_rate: 11,
            rarity: "random",
        });
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [
                {
                    size: 10,
                    type: "plain/text",
                    name: "my-text-inscription-file-2.txt",
                    dataURL: "data:plain/text;base64,dGVzdCBvcmRlcg==",
                    duration: 1200,
                },
            ],
            receiverAddress:
                "tb1pwjt7j5ztg5vw7y4havg4gaemlzkq8fhgrwltvldeq4fay22m60rqf920wy",
            payAddress: "2N1YtccU92ZWQmyBCfo77qGbqXCKfxp7wkP",
            rarity: "random",
            feeRate: 11,
        });

        // expect(prismaMock.ordinal.create).toBeCalledTimes(1);
        expect(res.status).toEqual(200);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("success");
        expect(res.body).toHaveProperty("message");
    });

    it("POST /inscribe should return 400 if no files are provided", async () => {
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [],
            rarity: "2009",
            payAddress: "0x123456789",
            receiverAddress: "0x123456789",
        });
        expect(prismaMock.order.create).toBeCalledTimes(0);
        expect(res.status).toEqual(400);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("message");
    });

    it("POST /inscribe should return 400 if no receiverAddress is provided", async () => {
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [
                {
                    name: "test",
                    type: "image/png",
                    dataURL: "data:image/png;base64,123456789",
                    size: 10,
                },
            ],

            rarity: "2009",
            receiverAddress: "",
        });

        expect(res.status).toEqual(400);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("message");
    });
});
