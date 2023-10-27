import { app } from "../../src/server";
import supertest from "supertest";

import { mock } from "jest-mock-extended";
import needle, { NeedleResponse } from "needle";
const requestWithSupertest = supertest(app);

jest.mock("needle", () =>
    jest.fn(() => {
        return {
            status: 200,
            body: {
                status: "ok",
                charge: {
                    id: "123456789",
                },
            },
        };
    })
);

describe("Orders Endpoints", () => {
    it("POST /inscribe should create an order", async () => {
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [
                {
                    name: "test",
                    type: "image/png",
                    dataURL: "data:image/png;base64,123456789",
                    size: 10,
                },
            ],
            qty: 1,
            rarity: "2009",
            receiverAddress: "0x123456789",
        });

        expect(res.status).toEqual(200);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("success");
        expect(res.body).toHaveProperty("message");
    });

    it("POST /inscribe should return 400 if no files are provided", async () => {
        const res = await requestWithSupertest.post("/inscribe").send({
            files: [],
            qty: 1,
            rarity: "2009",
            receiverAddress: "0x123456789",
        });
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
            qty: 1,
            rarity: "2009",
            receiverAddress: "",
        });

        expect(res.status).toEqual(400);
        expect(res.type).toEqual(expect.stringContaining("json"));
        expect(res.body).toHaveProperty("message");
    });
});
