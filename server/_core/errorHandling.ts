import type { ErrorRequestHandler } from "express";
import { logInternalError } from "./errorLogging";

export const globalErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  logInternalError(`HTTP ${req.method} ${req.path}`, error);
  if (res.headersSent) {
    res.end();
    return;
  }

  const candidateStatus = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 500;
  const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  const message = status >= 500
    ? "Ocorreu um erro interno. Tente novamente."
    : "Não foi possível processar a solicitação.";

  if (req.path.startsWith("/api/")) {
    res.status(status).json({ error: message });
    return;
  }
  res.status(status).type("text/plain").send(message);
};
