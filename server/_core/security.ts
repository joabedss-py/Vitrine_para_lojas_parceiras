import type { RequestHandler } from "express";

export const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https://d36hbw14aib5lz.cloudfront.net",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Vite injects development/HMR scripts; enforce the strict policy in production.
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Content-Security-Policy", PRODUCTION_CONTENT_SECURITY_POLICY);
    res.setHeader("X-Frame-Options", "DENY");
  }

  // Preview uses NODE_ENV=development and remains embeddable; production is not.
  next();
};
