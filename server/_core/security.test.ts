import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_CONTENT_SECURITY_POLICY, securityHeaders } from "./security";

afterEach(() => vi.unstubAllEnvs());

describe("security headers", () => {
  it("sends strict production CSP and HTTPS safety headers without blocking Preview framing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: number | string | readonly string[]) => {
        headers.set(name.toLowerCase(), String(value));
      },
    } as unknown as Response;
    const next = vi.fn();

    securityHeaders({} as Request, response, next);

    const csp = headers.get("content-security-policy") ?? "";
    expect(csp).toBe(PRODUCTION_CONTENT_SECURITY_POLICY);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(next).toHaveBeenCalledOnce();
  });

  it("leaves Vite development CSP to the HMR server", () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: number | string | readonly string[]) => {
        headers.set(name.toLowerCase(), String(value));
      },
    } as unknown as Response;

    securityHeaders({} as Request, response, vi.fn());

    expect(headers.has("content-security-policy")).toBe(false);
    expect(headers.has("x-frame-options")).toBe(false);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });
});
