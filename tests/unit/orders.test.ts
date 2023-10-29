import { app } from "../../src/server";
import supertest from "supertest";
import { prismaMock } from "../prisma-singleton";
import { hashFile } from "../../src/lib/hashfile";

const requestWithSupertest = supertest(app);

jest.mock("needle", () =>
    jest.fn((method, url, body, opts) => {
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
    })
);

describe("Orders Endpoints", () => {
    it("POST /inscribe should create an order", async () => {
        prismaMock.order.create.mockResolvedValueOnce({
            id: 1,
            created_at: new Date(),
            updated_at: new Date(),
            html_inscription_index: 1,
            html_transaction_id: 1,
            ordinals_bot_order_id: "2143",
            receiver_address: "afadf",
            update_token: "4124",
        });
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [
                {
                    name: "test.webp",
                    type: "image/webp",
                    dataURL: "data:image/webp;base64,123456789",
                    size: 10,
                },
            ],
            rarity: "2009",
            receiverAddress: "0x123456789",
        });
        expect(prismaMock.orderFile.create).toBeCalledTimes(1);
        expect(res.status).toEqual(200);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("success");
        expect(res.body).toHaveProperty("message");
    });

    it("POST /inscribe should return 400 if no files are provided", async () => {
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [],
            rarity: "2009",
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
