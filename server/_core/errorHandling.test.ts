import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { globalErrorHandler } from "./errorHandling";

const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
afterEach(() => consoleError.mockClear());

describe("global HTTP error handling", () => {
  it("returns a generic API error while retaining a redacted internal log", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = { headersSent: false, status, json } as unknown as Response;
    const request = { method: "GET", path: "/api/example" } as Request;

    globalErrorHandler(new Error("Database failure access_token=example-secret"), request, response, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "Ocorreu um erro interno. Tente novamente." });
    expect(JSON.stringify(json.mock.calls)).not.toContain("example-secret");
    expect(consoleError).toHaveBeenCalledWith(
      "[HTTP GET /api/example]",
      expect.objectContaining({ message: "Database failure access_token=[redacted]", stack: expect.any(String) }),
    );
  });

  it("returns generic plain text for a non-API request", () => {
    const status = vi.fn().mockReturnThis();
    const type = vi.fn().mockReturnThis();
    const send = vi.fn();
    const response = { headersSent: false, status, type, send } as unknown as Response;
    const request = { method: "GET", path: "/" } as Request;

    globalErrorHandler(new Error("internal detail"), request, response, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(type).toHaveBeenCalledWith("text/plain");
    expect(send).toHaveBeenCalledWith("Ocorreu um erro interno. Tente novamente.");
  });
});
