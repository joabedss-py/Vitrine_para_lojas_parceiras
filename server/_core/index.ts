import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "./googleOAuth";
import { registerMercadoLivreOAuthRoutes } from "./marketplaceOAuth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { claimProductMonitorRun, isRegisteredProductMonitorTask, markProductMonitorRun, PRODUCT_MONITOR_CALLBACK_PATH, runDueProductChecks } from "../productMonitor";
import { claimWhatsAppAnnouncementsRun, isRegisteredWhatsAppAnnouncementsTask, markWhatsAppAnnouncementsRun, runDueWhatsAppAnnouncements, WHATSAPP_ANNOUNCEMENTS_CALLBACK_PATH } from "../whatsappAnnouncements";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { logInternalError } from "./errorLogging";
import { globalErrorHandler } from "./errorHandling";
import { securityHeaders } from "./security";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(securityHeaders);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  registerGoogleOAuthRoutes(app);
  registerMercadoLivreOAuthRoutes(app);
  app.post(PRODUCT_MONITOR_CALLBACK_PATH, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const identity = await sdk.authenticateRequest(req);
      if (!identity.isCron || !identity.taskUid || !(await isRegisteredProductMonitorTask(identity.taskUid))) {
        res.status(403).json({ error: "Não autorizado." });
        return;
      }
      const claimed = await claimProductMonitorRun(identity.taskUid);
      if (!claimed) {
        res.status(200).json({ processed: 0, succeeded: 0, failed: 0, skipped: "already_running" });
        return;
      }
      const result = await runDueProductChecks();
      await markProductMonitorRun(identity.taskUid);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  app.post(WHATSAPP_ANNOUNCEMENTS_CALLBACK_PATH, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const identity = await sdk.authenticateRequest(req);
      if (!identity.isCron || !identity.taskUid || !(await isRegisteredWhatsAppAnnouncementsTask(identity.taskUid))) {
        res.status(403).json({ error: "Não autorizado." });
        return;
      }
      const claimed = await claimWhatsAppAnnouncementsRun(identity.taskUid);
      if (!claimed) {
        res.status(200).json({ processed: 0, sent: 0, pending: 0, failed: 0, skipped: "already_running" });
        return;
      }
      const result = await runDueWhatsAppAnnouncements();
      await markWhatsAppAnnouncementsRun(identity.taskUid);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path, req }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logInternalError(`tRPC ${path ?? "unknown path"} (${req.method})`, error);
        }
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use(globalErrorHandler);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
