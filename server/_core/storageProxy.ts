import type { Express } from "express";
import { ENV } from "./env";
import { logInternalError } from "./errorLogging";

const STORAGE_ERROR_MESSAGE = "Não foi possível acessar este arquivo. Tente novamente.";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Solicitação inválida.");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      logInternalError("StorageProxy configuration", new Error("Storage backend is not configured"));
      res.status(500).send(STORAGE_ERROR_MESSAGE);
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        logInternalError("StorageProxy upstream", new Error(`Storage backend returned HTTP ${forgeResp.status}`));
        res.status(502).send(STORAGE_ERROR_MESSAGE);
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        logInternalError("StorageProxy upstream", new Error("Storage backend returned no download URL"));
        res.status(502).send(STORAGE_ERROR_MESSAGE);
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (error) {
      logInternalError("StorageProxy", error);
      res.status(502).send(STORAGE_ERROR_MESSAGE);
    }
  });
}
