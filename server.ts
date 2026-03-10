import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";
import { Storage } from "@google-cloud/storage";
import cookieSession from "cookie-session";

declare global {
  namespace Express {
    interface Request {
      session: any;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("promptstudio.db");

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || "https://snwofoypavgrcpdpymlj.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNud29mb3lwYXZncmNwZHB5bWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDg5NDgsImV4cCI6MjA4ODcyNDk0OH0.h2Swp87Sfuq_2sGLud4brsIhDwCj_I0TLkflVFJ5-JY";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Read-only queries use anon client; storage uploads use service-role client
let supabase: any = null;
let supabaseAdmin: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http")) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase (anon) configured.");
  } catch (err) {
    console.error("Supabase initialization failed:", err);
  }
}

if (supabaseUrl && supabaseServiceKey) {
  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
    console.log("Supabase (service role) configured — Storage uploads enabled.");
  } catch (err) {
    console.error("Supabase admin initialization failed:", err);
  }
}

if (!supabase) {
  console.log("Using local SQLite (ephemeral). Add SUPABASE_URL and SUPABASE_ANON_KEY for persistence.");
}

// ---------------------------------------------------------------------------
// Google / GCS config
// ---------------------------------------------------------------------------
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const gcsBucketName = process.env.GCS_BUCKET_NAME;
const sessionSecret = process.env.SESSION_SECRET || "prompt-studio-secret";

const oauth2Client = (googleClientId && googleClientSecret)
  ? new OAuth2Client(googleClientId, googleClientSecret)
  : null;

const gcsStorage = gcsBucketName ? new Storage() : null;
const bucket = gcsStorage ? gcsStorage.bucket(gcsBucketName) : null;

if (oauth2Client) console.log("Google OAuth configured.");
if (bucket) console.log(`Google Cloud Storage configured: ${gcsBucketName}`);

// ---------------------------------------------------------------------------
// SQLite schema (local dev fallback)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    idea TEXT,
    prompt_json TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    style_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS palettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    image_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS references_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    image_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS showcase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    type TEXT,
    item_id INTEGER,
    starred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showcase_id INTEGER,
    text TEXT,
    author TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS project_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    brief TEXT,
    global_style TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS prompt_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    category TEXT,
    title TEXT,
    prompt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO project_settings (id, name, brief, global_style)
  VALUES (1, 'Main Workspace', 'Your primary creative environment.', 'Modern, Clean, Minimalist');
`);

// Migrations (silent — columns may already exist)
const migrations = [
  "ALTER TABLE palettes ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE references_images ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE generations ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE generations ADD COLUMN feedback TEXT",
  "ALTER TABLE generations ADD COLUMN batch_id TEXT",
  "ALTER TABLE generations ADD COLUMN selected_references TEXT",
  "ALTER TABLE palettes ADD COLUMN image_data TEXT",
  "ALTER TABLE generations ADD COLUMN parent_id INTEGER",
  "ALTER TABLE showcase ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE styles ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE prompt_library ADD COLUMN project_id INTEGER DEFAULT 1",
];
for (const m of migrations) {
  try { db.prepare(m).run(); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Upload a base64 data URI to Supabase Storage. Returns the public URL. */
async function uploadImageToStorage(userId: string, type: string, dataUrl: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  const filename = `${userId}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("promptphotos")
    .upload(filename, buffer, { contentType: mimeType, upsert: false });
  if (error) {
    console.error("Storage upload error:", error.message);
    return null;
  }
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("promptphotos")
    .getPublicUrl(filename);
  return publicUrl;
}

/** Delete an image from Supabase Storage by its public URL. */
async function deleteImageFromStorage(publicUrl: string) {
  if (!supabaseAdmin || !publicUrl) return;
  try {
    const url = new URL(publicUrl);
    // path is like /storage/v1/object/public/promptphotos/userId/type/file.png
    const parts = url.pathname.split("/storage/v1/object/public/promptphotos/");
    if (parts.length === 2) {
      await supabaseAdmin.storage.from("promptphotos").remove([parts[1]]);
    }
  } catch (_) {}
}

/** Resolve the display URL for an image record (prefers image_url, falls back to image_data). */
function resolveImageData(row: any): any {
  if (!row) return row;
  return { ...row, image_data: row.image_url || row.image_data };
}

/** Ensure a user record and default project exist on first login. Returns project id. */
async function bootstrapUser(user: { id: string; email: string; name: string; picture: string }) {
  if (!supabaseAdmin) return 1;

  // Upsert user profile
  await supabaseAdmin.from("users").upsert(
    { id: user.id, email: user.email, name: user.name, picture: user.picture },
    { onConflict: "id" }
  );

  // Check for existing project
  const { data: existing } = await supabaseAdmin
    .from("project_settings")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create default project
  const { data: created } = await supabaseAdmin
    .from("project_settings")
    .insert([{
      user_id: user.id,
      name: `${user.name.split(" ")[0]}'s Workspace`,
      brief: "Your primary creative environment.",
      global_style: "Modern, Clean, Minimalist"
    }])
    .select("id")
    .single();

  return created?.id ?? 1;
}

async function saveToGCS(userId: string, data: any) {
  if (!bucket) return;
  const file = bucket.file(`users/${userId}/workspace.json`);
  await file.save(JSON.stringify(data), { contentType: "application/json", resumable: false });
}

async function loadFromGCS(userId: string) {
  if (!bucket) return null;
  const file = bucket.file(`users/${userId}/workspace.json`);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [content] = await file.download();
  return JSON.parse(content.toString());
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieSession({
    name: "session",
    keys: [sessionSecret],
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  }));

  // Auth guard middleware — attach to data routes below
  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Authentication required. Please sign in." });
    }
    next();
  }

  // ---------------------------------------------------------------------------
  // Auth routes (no requireAuth)
  // ---------------------------------------------------------------------------
  app.get("/api/auth/url", (req, res) => {
    if (!oauth2Client) return res.status(500).json({ error: "Google OAuth not configured" });
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email"
      ],
      redirect_uri: redirectUri
    });
    res.json({ url });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    if (!oauth2Client || !code) return res.status(400).send("Invalid request");
    try {
      const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
      const { tokens } = await oauth2Client.getToken({ code: code as string, redirect_uri: redirectUri });
      oauth2Client.setCredentials(tokens);
      const ticket = await oauth2Client.verifyIdToken({ idToken: tokens.id_token!, audience: googleClientId });
      const payload = ticket.getPayload();
      const user = {
        id: payload?.sub!,
        email: payload?.email!,
        name: payload?.name!,
        picture: payload?.picture!
      };
      if (req.session) req.session.user = user;

      // Bootstrap user + default project (non-blocking)
      bootstrapUser(user).catch(err => console.error("Bootstrap user error:", err));

      res.send(`
        <html><body><script>
          if (window.opener) { window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*'); window.close(); }
          else { window.location.href = '/'; }
        </script><p>Authentication successful. This window should close automatically.</p></body></html>
      `);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/me", (req, res) => res.json(req.session?.user || null));

  app.post("/api/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // All data routes require authentication
  // ---------------------------------------------------------------------------

  // Global Search
  app.get("/api/search", requireAuth, (req, res) => {
    const query = `%${req.query.q || ""}%`;
    const results = {
      generations: db.prepare(`
        SELECT g.*, COALESCE(p.name, 'Unknown Project') as project_name
        FROM generations g LEFT JOIN project_settings p ON g.project_id = p.id
        WHERE g.idea LIKE ? OR g.prompt_json LIKE ?
      `).all(query, query),
      library: db.prepare(`
        SELECT l.*, COALESCE(p.name, 'Unknown Project') as project_name
        FROM prompt_library l LEFT JOIN project_settings p ON l.project_id = p.id
        WHERE l.title LIKE ? OR l.prompt LIKE ?
      `).all(query, query),
      projects: db.prepare("SELECT * FROM project_settings WHERE name LIKE ? OR brief LIKE ?").all(query, query)
    };
    res.json(results);
  });

  // Project Stats
  app.get("/api/projects/stats", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    if (supabase) {
      const { data: stats, error } = await supabase
        .from("project_settings")
        .select(`id, name, generations:generations(count), library:prompt_library(count), references:references_images(count)`)
        .eq("user_id", userId);
      if (error) return res.status(500).json({ error: error.message });
      const formattedStats = stats.map((s: any) => ({
        id: s.id, name: s.name,
        generation_count: s.generations?.[0]?.count || 0,
        library_count: s.library?.[0]?.count || 0,
        reference_count: s.references?.[0]?.count || 0
      }));
      return res.json(formattedStats);
    }
    const stats = db.prepare(`
      SELECT p.id, p.name,
        (SELECT COUNT(*) FROM generations WHERE project_id = p.id) as generation_count,
        (SELECT COUNT(*) FROM prompt_library WHERE project_id = p.id) as library_count,
        (SELECT COUNT(*) FROM references_images WHERE project_id = p.id) as reference_count
      FROM project_settings p
    `).all();
    res.json(stats);
  });

  // Rescue (SQLite only)
  app.get("/api/rescue", requireAuth, (req, res) => {
    try {
      db.prepare("INSERT OR IGNORE INTO project_settings (id, name, brief, global_style) VALUES (1, 'Main Workspace', 'Your primary creative environment.', 'Modern, Clean, Minimalist')").run();
      const counts = {
        generations: db.prepare("UPDATE generations SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        library: db.prepare("UPDATE prompt_library SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        palettes: db.prepare("UPDATE palettes SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        references: db.prepare("UPDATE references_images SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        showcase: db.prepare("UPDATE showcase SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        styles: db.prepare("UPDATE styles SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
      };
      res.json({ success: true, fixed: counts });
    } catch (error) {
      res.status(500).json({ error: "Rescue operation failed" });
    }
  });

  // ---------------------------------------------------------------------------
  // Generations
  // ---------------------------------------------------------------------------
  app.get("/api/generations", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
    if (supabase) {
      let query = supabase.from("generations").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data.map(resolveImageData));
    }
    const rows = projectId
      ? db.prepare("SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
      : db.prepare("SELECT * FROM generations ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.post("/api/generations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references } = req.body;
      if (!image_data) return res.status(400).json({ error: "Missing image_data" });

      if (supabase) {
        // Upload image to Supabase Storage
        const imageUrl = await uploadImageToStorage(userId, "generations", image_data);
        const { data, error } = await (supabaseAdmin || supabase)
          .from("generations")
          .insert([{
            user_id: userId,
            idea,
            prompt_json,
            image_data: imageUrl ? null : image_data,  // only store base64 if storage failed
            image_url: imageUrl,
            parent_id: parent_id || null,
            project_id: project_id || null,
            feedback: feedback || null,
            batch_id: batch_id || null,
            selected_references: selected_references || null
          }])
          .select("id")
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }

      const info = db.prepare(
        "INSERT INTO generations (idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(idea, prompt_json, image_data, parent_id || null, project_id || 1, feedback || null, batch_id || null, selected_references || null);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Failed to save generation:", error);
      res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/generations/:id", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    if (supabase) {
      // Fetch image_url before deleting so we can clean up storage
      const { data: row } = await (supabaseAdmin || supabase)
        .from("generations").select("image_url").eq("id", req.params.id).eq("user_id", userId).maybeSingle();
      if (row?.image_url) await deleteImageFromStorage(row.image_url);
      const { error } = await (supabaseAdmin || supabase)
        .from("generations").delete().eq("id", req.params.id).eq("user_id", userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM generations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  app.get("/api/styles", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
    if (supabase) {
      let query = supabase.from("styles").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = projectId
      ? db.prepare("SELECT * FROM styles WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
      : db.prepare("SELECT * FROM styles ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.post("/api/styles", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const { name, style_json, project_id } = req.body;
    if (supabase) {
      const { data, error } = await (supabaseAdmin || supabase)
        .from("styles")
        .insert([{ user_id: userId, name, style_json, project_id: project_id || null }])
        .select("id").single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO styles (name, style_json, project_id) VALUES (?, ?, ?)").run(name, style_json, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  // ---------------------------------------------------------------------------
  // Palettes
  // ---------------------------------------------------------------------------
  app.get("/api/palettes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      if (supabase) {
        let query = supabase.from("palettes").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        if (projectId) query = query.eq("project_id", projectId);
        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data.map(resolveImageData));
      }
      const rows = projectId
        ? db.prepare("SELECT * FROM palettes WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
        : db.prepare("SELECT * FROM palettes ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch palettes" });
    }
  });

  app.post("/api/palettes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { name, image_data, project_id } = req.body;
      if (supabase) {
        const imageUrl = await uploadImageToStorage(userId, "palettes", image_data);
        const { data, error } = await (supabaseAdmin || supabase)
          .from("palettes")
          .insert([{
            user_id: userId,
            name,
            image_data: imageUrl ? null : image_data,
            image_url: imageUrl,
            project_id: project_id || null
          }])
          .select("id").single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO palettes (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to save palette" });
    }
  });

  // ---------------------------------------------------------------------------
  // References (base64 kept in DB — needed for Gemini inline image generation)
  // ---------------------------------------------------------------------------
  app.get("/api/references", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      if (supabase) {
        let query = supabase.from("references_images").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        if (projectId) query = query.eq("project_id", projectId);
        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const rows = projectId
        ? db.prepare("SELECT * FROM references_images WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
        : db.prepare("SELECT * FROM references_images ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch references" });
    }
  });

  app.post("/api/references", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { name, image_data, project_id } = req.body;
      if (supabase) {
        const { data, error } = await (supabaseAdmin || supabase)
          .from("references_images")
          .insert([{ user_id: userId, name, image_data, project_id: project_id || null }])
          .select("id").single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO references_images (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to save reference" });
    }
  });

  // ---------------------------------------------------------------------------
  // Showcase
  // ---------------------------------------------------------------------------
  app.get("/api/showcase", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      if (supabase) {
        let query = supabase
          .from("showcase")
          .select(`*, generations (image_data, image_url, idea), references_images (image_data, name), palettes (image_data, image_url, name)`)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (projectId) query = query.eq("project_id", projectId);
        const { data: showcase, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        const formatted = showcase.map((s: any) => {
          let image_preview = null, title = null;
          if (s.type === "generation") {
            image_preview = s.generations?.image_url || s.generations?.image_data;
            title = s.generations?.idea;
          } else if (s.type === "reference") {
            image_preview = s.references_images?.image_data;
            title = s.references_images?.name;
          } else if (s.type === "palette") {
            image_preview = s.palettes?.image_url || s.palettes?.image_data;
            title = s.palettes?.name;
          }
          return { ...s, image_preview, title };
        });
        return res.json(formatted);
      }
      const rows = db.prepare(`
        SELECT s.*,
          CASE WHEN s.type = 'generation' THEN g.image_data
               WHEN s.type = 'reference' THEN r.image_data
               WHEN s.type = 'palette' THEN p.image_data ELSE NULL END as image_preview,
          CASE WHEN s.type = 'generation' THEN g.idea
               WHEN s.type = 'reference' THEN r.name
               WHEN s.type = 'palette' THEN p.name END as title
        FROM showcase s
        LEFT JOIN generations g ON s.type = 'generation' AND s.item_id = g.id
        LEFT JOIN references_images r ON s.type = 'reference' AND s.item_id = r.id
        LEFT JOIN palettes p ON s.type = 'palette' AND s.item_id = p.id
        WHERE s.project_id = ?
        ORDER BY s.created_at DESC
      `).all(projectId || 1);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch showcase" });
    }
  });

  app.post("/api/showcase", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const { type, item_id, project_id } = req.body;
    if (supabase) {
      const { data, error } = await (supabaseAdmin || supabase)
        .from("showcase")
        .insert([{ user_id: userId, type, item_id, project_id: project_id || null }])
        .select("id").single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO showcase (type, item_id, project_id) VALUES (?, ?, ?)").run(type, item_id, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/showcase/:id/star", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    if (supabase) {
      const { data: current } = await supabase.from("showcase").select("starred").eq("id", req.params.id).eq("user_id", userId).single();
      const { error } = await (supabaseAdmin || supabase).from("showcase").update({ starred: !current?.starred }).eq("id", req.params.id).eq("user_id", userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("UPDATE showcase SET starred = 1 - starred WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------
  app.get("/api/showcase/:id/comments", requireAuth, async (req, res) => {
    if (supabase) {
      const { data, error } = await supabase.from("comments").select("*").eq("showcase_id", req.params.id).order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    res.json(db.prepare("SELECT * FROM comments WHERE showcase_id = ? ORDER BY created_at ASC").all(req.params.id));
  });

  app.post("/api/showcase/:id/comments", requireAuth, async (req, res) => {
    try {
      const { text, author } = req.body;
      if (supabase) {
        const { data, error } = await (supabaseAdmin || supabase)
          .from("comments")
          .insert([{ showcase_id: req.params.id, text, author }])
          .select("id").single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO comments (showcase_id, text, author) VALUES (?, ?, ?)").run(req.params.id, text, author);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      if (supabase) {
        const { data, error } = await supabase.from("project_settings").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
        if (error) throw error;
        return res.json(data);
      }
      res.json(db.prepare("SELECT * FROM project_settings ORDER BY updated_at DESC").all());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      if (supabase) {
        const { data, error } = await supabase.from("project_settings").select("*").eq("id", req.params.id).eq("user_id", userId).single();
        if (error) throw error;
        return res.json(data);
      }
      res.json(db.prepare("SELECT * FROM project_settings WHERE id = ?").get(req.params.id));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { data, error } = await (supabaseAdmin || supabase)
          .from("project_settings")
          .insert([{ user_id: userId, name: name || "New Project", brief: brief || "", global_style: global_style || "" }])
          .select("id").single();
        if (error) throw error;
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO project_settings (name, brief, global_style) VALUES (?, ?, ?)").run(name || "New Project", brief || "", global_style || "");
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { error } = await (supabaseAdmin || supabase)
          .from("project_settings")
          .update({ name, brief, global_style, updated_at: new Date().toISOString() })
          .eq("id", req.params.id)
          .eq("user_id", userId);
        if (error) throw error;
        return res.json({ success: true });
      }
      db.prepare("UPDATE project_settings SET name = ?, brief = ?, global_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(name, brief, global_style, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // ---------------------------------------------------------------------------
  // Prompt Library
  // ---------------------------------------------------------------------------
  app.get("/api/library", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    if (supabase) {
      const { data, error } = await supabase.from("prompt_library").select("*").eq("user_id", userId).order("category", { ascending: true }).order("title", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    res.json(db.prepare("SELECT * FROM prompt_library ORDER BY category ASC, title ASC").all());
  });

  app.post("/api/library", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const { category, title, prompt } = req.body;
    if (supabase) {
      const { data, error } = await (supabaseAdmin || supabase)
        .from("prompt_library")
        .insert([{ user_id: userId, category, title, prompt }])
        .select("id").single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, 1)").run(category, title, prompt);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/library/import", requireAuth, (req, res) => {
    const { items } = req.body;
    const insert = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, 1)");
    db.transaction((items: any[]) => { for (const item of items) insert.run(item.category, item.title, item.prompt); })(items);
    res.json({ success: true });
  });

  app.delete("/api/library/:id", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    if (supabase) {
      const { error } = await (supabaseAdmin || supabase).from("prompt_library").delete().eq("id", req.params.id).eq("user_id", userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM prompt_library WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // Privacy / Export / Import
  // ---------------------------------------------------------------------------
  app.post("/api/purge", requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    try {
      if (supabase) {
        // Delete all user data from Supabase (cascades via FK)
        await (supabaseAdmin || supabase).from("users").delete().eq("id", userId);
        // Re-bootstrap user without data
        await bootstrapUser(req.session.user);
        return res.json({ success: true, message: "Your data has been purged." });
      }
      db.exec(`
        DELETE FROM comments; DELETE FROM showcase; DELETE FROM references_images;
        DELETE FROM palettes; DELETE FROM prompt_library; DELETE FROM styles; DELETE FROM generations;
        DELETE FROM project_settings WHERE id > 1;
        UPDATE project_settings SET name = 'Main Workspace', brief = 'Your primary creative environment.', global_style = 'Modern, Clean, Minimalist' WHERE id = 1;
      `);
      res.json({ success: true, message: "Server database purged successfully." });
    } catch (error) {
      res.status(500).json({ error: "Purge failed" });
    }
  });

  app.get("/api/export", requireAuth, (req, res) => {
    try {
      res.json({
        projects: db.prepare("SELECT * FROM project_settings").all(),
        generations: db.prepare("SELECT * FROM generations").all(),
        library: db.prepare("SELECT * FROM prompt_library").all(),
        palettes: db.prepare("SELECT * FROM palettes").all(),
        references: db.prepare("SELECT * FROM references_images").all(),
        showcase: db.prepare("SELECT * FROM showcase").all(),
        styles: db.prepare("SELECT * FROM styles").all(),
        comments: db.prepare("SELECT * FROM comments").all(),
      });
    } catch (error) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/import", requireAuth, (req, res) => {
    try {
      const data = req.body;
      db.transaction((data: any) => {
        db.prepare("DELETE FROM comments").run();
        db.prepare("DELETE FROM showcase").run();
        db.prepare("DELETE FROM references_images").run();
        db.prepare("DELETE FROM palettes").run();
        db.prepare("DELETE FROM prompt_library").run();
        db.prepare("DELETE FROM styles").run();
        db.prepare("DELETE FROM generations").run();
        db.prepare("DELETE FROM project_settings").run();

        const insProject = db.prepare("INSERT INTO project_settings (id, name, brief, global_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const p of data.projects || []) insProject.run(p.id, p.name, p.brief, p.global_style, p.created_at, p.updated_at);

        const insGen = db.prepare("INSERT INTO generations (id, project_id, idea, prompt_json, image_data, parent_id, feedback, batch_id, selected_references, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        for (const g of data.generations || []) insGen.run(g.id, g.project_id, g.idea, g.prompt_json, g.image_data, g.parent_id, g.feedback, g.batch_id, g.selected_references, g.created_at);

        const insLib = db.prepare("INSERT INTO prompt_library (id, project_id, category, title, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const l of data.library || []) insLib.run(l.id, l.project_id, l.category, l.title, l.prompt, l.created_at);

        const insPal = db.prepare("INSERT INTO palettes (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const p of data.palettes || []) insPal.run(p.id, p.project_id, p.name, p.image_data, p.created_at);

        const insRef = db.prepare("INSERT INTO references_images (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const r of data.references || []) insRef.run(r.id, r.project_id, r.name, r.image_data, r.created_at);

        const insShow = db.prepare("INSERT INTO showcase (id, project_id, type, item_id, starred, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const s of data.showcase || []) insShow.run(s.id, s.project_id, s.type, s.item_id, s.starred, s.created_at);

        const insStyle = db.prepare("INSERT INTO styles (id, project_id, name, style_json, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const s of data.styles || []) insStyle.run(s.id, s.project_id, s.name, s.style_json, s.created_at);

        const insComm = db.prepare("INSERT INTO comments (id, showcase_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const c of data.comments || []) insComm.run(c.id, c.showcase_id, c.text, c.author, c.created_at);
      })(data);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Import failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // ---------------------------------------------------------------------------
  // GCS Sync / Restore
  // ---------------------------------------------------------------------------
  app.post("/api/sync", requireAuth, async (req, res) => {
    try {
      const data = {
        projects: db.prepare("SELECT * FROM project_settings").all(),
        generations: db.prepare("SELECT * FROM generations").all(),
        library: db.prepare("SELECT * FROM prompt_library").all(),
        palettes: db.prepare("SELECT * FROM palettes").all(),
        references: db.prepare("SELECT * FROM references_images").all(),
        showcase: db.prepare("SELECT * FROM showcase").all(),
        styles: db.prepare("SELECT * FROM styles").all(),
        comments: db.prepare("SELECT * FROM comments").all(),
      };
      await saveToGCS(req.session.user.id, data);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.post("/api/restore", requireAuth, async (req, res) => {
    try {
      const data = await loadFromGCS(req.session.user.id);
      if (!data) return res.status(404).json({ error: "No backup found in GCS" });
      db.transaction((data: any) => {
        db.prepare("DELETE FROM comments").run();
        db.prepare("DELETE FROM showcase").run();
        db.prepare("DELETE FROM references_images").run();
        db.prepare("DELETE FROM palettes").run();
        db.prepare("DELETE FROM prompt_library").run();
        db.prepare("DELETE FROM styles").run();
        db.prepare("DELETE FROM generations").run();
        db.prepare("DELETE FROM project_settings").run();

        const insProject = db.prepare("INSERT INTO project_settings (id, name, brief, global_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const p of data.projects || []) insProject.run(p.id, p.name, p.brief, p.global_style, p.created_at, p.updated_at);

        const insGen = db.prepare("INSERT INTO generations (id, project_id, idea, prompt_json, image_data, parent_id, feedback, batch_id, selected_references, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        for (const g of data.generations || []) insGen.run(g.id, g.project_id, g.idea, g.prompt_json, g.image_data, g.parent_id, g.feedback, g.batch_id, g.selected_references, g.created_at);

        const insLib = db.prepare("INSERT INTO prompt_library (id, project_id, category, title, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const l of data.library || []) insLib.run(l.id, l.project_id, l.category, l.title, l.prompt, l.created_at);

        const insPal = db.prepare("INSERT INTO palettes (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const p of data.palettes || []) insPal.run(p.id, p.project_id, p.name, p.image_data, p.created_at);

        const insRef = db.prepare("INSERT INTO references_images (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const r of data.references || []) insRef.run(r.id, r.project_id, r.name, r.image_data, r.created_at);

        const insShow = db.prepare("INSERT INTO showcase (id, project_id, type, item_id, starred, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const s of data.showcase || []) insShow.run(s.id, s.project_id, s.type, s.item_id, s.starred, s.created_at);

        const insStyle = db.prepare("INSERT INTO styles (id, project_id, name, style_json, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const s of data.styles || []) insStyle.run(s.id, s.project_id, s.name, s.style_json, s.created_at);

        const insComm = db.prepare("INSERT INTO comments (id, showcase_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const c of data.comments || []) insComm.run(c.id, c.showcase_id, c.text, c.author, c.created_at);
      })(data);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Restore failed" });
    }
  });

  // ---------------------------------------------------------------------------
  // Vite / static
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
