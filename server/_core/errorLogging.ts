function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b(access_token|refresh_token|id_token|client_secret|api[_-]?key|authorization|token|code)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi, "$1$2[redacted]");
}

export function logInternalError(scope: string, error: unknown): void {
  if (!(error instanceof Error)) {
    console.error(`[${scope}]`, redactSensitiveText(typeof error === "string" ? error : "Unknown non-Error exception"));
    return;
  }

  const details: Record<string, string> = {
    name: error.name,
    message: redactSensitiveText(error.message),
  };
  if (error.stack) details.stack = redactSensitiveText(error.stack);
  if (error.cause instanceof Error) {
    details.cause = redactSensitiveText(`${error.cause.name}: ${error.cause.message}\n${error.cause.stack ?? ""}`);
  }
  console.error(`[${scope}]`, details);
}
