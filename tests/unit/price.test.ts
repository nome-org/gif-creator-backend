import { app } from "../../src/server";
import supertest from "supertest";
const requestWithSupertest = supertest(app);

describe("GET /price", () => {
    it("should return 200 with calculated price when given valid query params", async () => {
        const res = await requestWithSupertest.get("/price?size=1&fee=1");

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(true);
    });

    it("should return 400 when given invalid query params", async () => {
        const res = await requestWithSupertest.get(
            "/price?size=1&fee=0.0001&count=invalid"
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(false);
    });

    it("should return 500 when the Ordinals Bot API returns an error", async () => {
        const res = await requestWithSupertest.get("/price?size=1&fee=0.0001");

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("success");
        expect(res.body.success).toEqual(false);
    });
});
