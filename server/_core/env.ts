// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() { return process.env.MANUS_PROJECT_ID ?? ""; },
  get cookieSecret() { return process.env.MANUS_JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get adminEmail() { return process.env.ADMIN_EMAIL ?? ""; },
  get googleClientId() { return process.env.GOOGLE_CLIENT_ID ?? ""; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? ""; },
  get mercadoLivreClientId() { return process.env.MERCADOLIVRE_CLIENT_ID ?? ""; },
  get mercadoLivreClientSecret() { return process.env.MERCADOLIVRE_CLIENT_SECRET ?? ""; },
  get publicSiteOrigin() {
    const fallback = "https://vitrineml-ecps2ye7.manus.space";
    const candidate = process.env.PUBLIC_SITE_ORIGIN?.trim();
    if (!candidate) return fallback;
    try {
      const url = new URL(candidate);
      return url.protocol === "https:" && !url.username && !url.password ? url.origin : fallback;
    } catch {
      return fallback;
    }
  },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },
};
