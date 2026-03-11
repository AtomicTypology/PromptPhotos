import type { Express } from "express";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims) {
      return res.json(null);
    }
    const claims = req.user.claims;
    res.json({
      id: claims.sub,
      email: claims.email,
      name: [claims.first_name, claims.last_name].filter(Boolean).join(" ") || claims.email || "User",
      picture: claims.profile_image_url,
      first_name: claims.first_name,
      last_name: claims.last_name,
    });
  });
}
