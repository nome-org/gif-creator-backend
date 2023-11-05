import z from "zod";

export const safeInt = z.number().safe().positive();
