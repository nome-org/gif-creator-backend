import { Request, Response, NextFunction } from "express";
import { app } from "../../src/server";
import { buildOrdinalsBotError } from "../../src/lib/error-response";
import * as needle from "needle";
import { mock } from "jest-mock-extended";
import supertest from "supertest";
const requestWithSupertest = supertest(app);

describe("GET /price", () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it("should return 200 with calculated price when given valid query params", async () => {
        const priceResponse = {
            body: {
                status: "ok",
                totalFee: 0.0001,
            },
        };

        jest.mock("needle", () =>
            jest.fn().mockResolvedValueOnce(priceResponse)
        );
        const res = await requestWithSupertest
            .get("/price?size=1&fee=0.0001")
            .expect(200);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(true);
    });

    it("should return 400 when given invalid query params", async () => {
        const res = await requestWithSupertest
            .get("/price?size=1&fee=0.0001&count=invalid")
            .expect(400);

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(false);
    });

    it("should return 500 when the Ordinals Bot API returns an error", async () => {
        const priceResponse = {
            body: {
                status: "error",
                message: "Something went wrong",
            },
        };

        jest.mock("needle", () =>
            jest.fn().mockResolvedValueOnce(priceResponse)
        );
        const res = await requestWithSupertest
            .get("/price?size=1&fee=0.0001")
            .expect(500);

        expect(res.statusCode).toBe(500);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(false);
    });
});
