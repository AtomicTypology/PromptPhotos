import "dotenv/config";
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

let db: any;
try {
  db = new Database("promptstudio.db");
  console.log("Local SQLite database initialized.");
} catch (err) {
  console.error("Failed to initialize SQLite database:", err);
  // Fallback to in-memory if file fails
  db = new Database(":memory:");
  console.log("Using in-memory SQLite database as fallback.");
}

// Supabase Client (if configured)
const supabaseUrl = process.env.SUPABASE_URL || "https://snwofoypavgrcpdpymlj.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNud29mb3lwYXZncmNwZHB5bWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDg5NDgsImV4cCI6MjA4ODcyNDk0OH0.h2Swp87Sfuq_2sGLud4brsIhDwCj_I0TLkflVFJ5-JY";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: any = null;   // anon key — public read ops only
let supabaseAdmin: any = null; // service role — all DB writes + storage

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("http")) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    if (supabaseServiceKey) {
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    }
  } catch (err) {
    console.error("Supabase initialization failed:", err);
    supabase = null;
  }
}

// For all server-side DB operations, prefer the service role key (bypasses RLS).
// If no service role key is set, fall back to the anon key (requires RLS to be
// disabled on every table — see supabase_schema.sql).
const supabaseDb: any = supabaseAdmin || supabase;

if (supabaseDb) {
  console.log(`Supabase DB configured (${supabaseAdmin ? 'service role — full access' : 'anon key — ensure RLS is disabled'}).`);
  supabaseDb.from('users').select('*', { count: 'exact', head: true }).limit(1).then(({ error }: any) => {
    if (error) console.error("⚠️  Supabase connection test FAILED:", error.message, "→ Have you run supabase_schema.sql?");
    else console.log("✓  Supabase connection test successful.");
  });
  if (supabaseAdmin) {
    console.log("✓  Supabase Admin (service role) configured for storage uploads.");
  }
} else {
  console.log("Using local SQLite only. Add SUPABASE_ANON_KEY (+ SUPABASE_SERVICE_ROLE_KEY for writes) to enable persistence.");
}

// Google Cloud Configuration
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const gcsBucketName = process.env.GCS_BUCKET_NAME;
const sessionSecret = process.env.SESSION_SECRET || "prompt-studio-secret";

const oauth2Client = (googleClientId && googleClientSecret)
  ? new OAuth2Client(googleClientId, googleClientSecret)
  : null;

const storage = gcsBucketName ? new Storage() : null;
const bucket = storage ? storage.bucket(gcsBucketName) : null;

if (oauth2Client) {
  console.log("Google OAuth configured.");
} else {
  console.warn("Google OAuth NOT configured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Secrets.");
}
if (bucket) {
  console.log(`Google Cloud Storage configured: ${gcsBucketName}`);
} else {
  console.log("Google Cloud Storage NOT configured. Local SQLite will be used for primary storage.");
}

// Initialize database — single authoritative schema, all columns present from the start
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER DEFAULT 1,
      idea TEXT,
      prompt_json TEXT,
      image_data TEXT,
      image_url TEXT,
      parent_id INTEGER,
      feedback TEXT,
      batch_id TEXT,
      selected_references TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER DEFAULT 1,
      name TEXT,
      style_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS palettes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER DEFAULT 1,
      name TEXT,
      image_data TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS references_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER DEFAULT 1,
      name TEXT,
      image_data TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS showcase (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
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
      user_id TEXT,
      name TEXT,
      brief TEXT,
      global_style TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS prompt_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER DEFAULT 1,
      category TEXT,
      title TEXT,
      prompt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS client_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      project_id INTEGER,
      token TEXT UNIQUE NOT NULL,
      label TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("SQLite schema ready.");
} catch (err) {
  console.error("Database schema execution failed:", err);
}

// Migration: add any columns that may be missing from older DB files.
// These silently no-op if the column already exists.
const migrations = [
  "ALTER TABLE generations ADD COLUMN user_id TEXT",
  "ALTER TABLE generations ADD COLUMN image_url TEXT",
  "ALTER TABLE generations ADD COLUMN feedback TEXT",
  "ALTER TABLE generations ADD COLUMN batch_id TEXT",
  "ALTER TABLE generations ADD COLUMN selected_references TEXT",
  "ALTER TABLE generations ADD COLUMN parent_id INTEGER",
  "ALTER TABLE generations ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE styles ADD COLUMN user_id TEXT",
  "ALTER TABLE styles ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE palettes ADD COLUMN user_id TEXT",
  "ALTER TABLE palettes ADD COLUMN image_url TEXT",
  "ALTER TABLE palettes ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE references_images ADD COLUMN user_id TEXT",
  "ALTER TABLE references_images ADD COLUMN image_url TEXT",
  "ALTER TABLE references_images ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE showcase ADD COLUMN user_id TEXT",
  "ALTER TABLE showcase ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE prompt_library ADD COLUMN user_id TEXT",
  "ALTER TABLE prompt_library ADD COLUMN project_id INTEGER DEFAULT 1",
  "ALTER TABLE project_settings ADD COLUMN user_id TEXT",
  "ALTER TABLE client_shares ADD COLUMN user_id TEXT",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists — ok */ }
}

async function saveToGCS(userId: string, data: any) {
  if (!bucket) return;
  const file = bucket.file(`users/${userId}/workspace.json`);
  await file.save(JSON.stringify(data), {
    contentType: 'application/json',
    resumable: false
  });
  console.log(`Saved workspace to GCS for user ${userId}`);
}

async function loadFromGCS(userId: string) {
  if (!bucket) return null;
  const file = bucket.file(`users/${userId}/workspace.json`);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [content] = await file.download();
  return JSON.parse(content.toString());
}

const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // If not logged in, block the request immediately
  const isGuestAllowed = req.method === 'GET' && !req.path.startsWith('/api/export');
  if (!req.session?.user && !isGuestAllowed) {
    return res.status(401).json({
      error: "Unauthorized",
      details: "You must be signed in. Please sign in with Google."
    });
  }

  // Best-effort: sync user row to Supabase. Never block the request if this fails.
  if (req.session?.user && supabaseDb && req.method !== 'GET') {
    const u = req.session.user;
    try {
      await supabaseDb.from('users').upsert(
        { id: u.id, email: u.email, name: u.name },
        { onConflict: 'id' }
      );
    } catch (e) {
      console.warn("Supabase user sync skipped (non-fatal):", (e as any)?.message || e);
    }
  }

  next();
};

async function uploadToSupabase(base64Data: string, bucketName: string, fileName: string) {
  if (!supabaseAdmin) return null;
  try {
    const base64Part = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Part, 'base64');
    const mimeMatch = base64Data.match(/data:([^;]+);/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
    const { error } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, buffer, { contentType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrl;
  } catch (error) {
    console.error("Supabase Storage upload failed:", error);
    return null;
  }
}

async function ensureStorageBucket(bucketName: string) {
  if (!supabaseAdmin) return;
  try {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) { console.error("Could not list Supabase buckets:", listError.message); return; }
    const exists = buckets?.some((b: any) => b.name === bucketName);
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(bucketName, { public: true });
      if (error) console.error(`Failed to create bucket '${bucketName}':`, error.message);
      else console.log(`✓ Created Supabase Storage bucket: ${bucketName} (public)`);
    } else {
      console.log(`✓ Supabase Storage bucket '${bucketName}' already exists.`);
    }
  } catch (err) {
    console.error("ensureStorageBucket error:", err);
  }
}

// Helper to get the correct redirect URI
const getRedirectUri = (req: express.Request) => {
  // 1. Check for x-forwarded headers (common in proxies/Cloud Run/Render)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  const detectedUrl = `${protocol}://${host}`;

  // 2. If APP_URL is set, we use it as the source of truth for the base domain
  // But we allow it to be overridden by the detected URL if it's a valid public URL
  // to support both dev and preview environments.
  const baseUrl = process.env.APP_URL || detectedUrl;

  return `${baseUrl.replace(/\/$/, "")}/auth/callback`;
};

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.set('trust proxy', 1);
    app.use(express.json({ limit: '50mb' }));
    const isProd = process.env.NODE_ENV === "production";
    app.use(cookieSession({
      name: 'session',
      keys: [sessionSecret],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax'
    }));

    // Ensure Supabase Storage bucket exists on startup
    if (supabaseAdmin) {
      ensureStorageBucket('promptphotos').catch(console.error);
    }

    // Auth Routes
    app.get("/api/auth/debug", (req, res) => {
      const redirectUri = getRedirectUri(req);

      res.json({
        envAppUrl: process.env.APP_URL || "NOT SET",
        reqProtocol: req.protocol,
        reqHost: req.get('host'),
        xForwardedProto: req.get('x-forwarded-proto'),
        redirectUri,
        googleClientId: googleClientId || "MISSING",
        googleClientSecret: googleClientSecret ? "SET" : "MISSING",
        sessionSecret: sessionSecret === "prompt-studio-secret" ? "DEFAULT" : "CUSTOM"
      });
    });

    app.get("/api/auth/url", (req, res) => {
      if (!oauth2Client) {
        return res.status(500).json({ error: "Google OAuth not configured" });
      }

      const redirectUri = getRedirectUri(req);

      console.log("DEBUG: Generating Auth URL");
      console.log("DEBUG: redirectUri:", redirectUri);

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
        redirect_uri: redirectUri
      });
      res.json({ url });
    });

    app.get("/auth/callback", async (req, res) => {
      const { code } = req.query;
      if (!oauth2Client || !code) {
        return res.status(400).send("Invalid request");
      }

      try {
        const redirectUri = getRedirectUri(req);

        const { tokens } = await oauth2Client.getToken({
          code: code as string,
          redirect_uri: redirectUri
        });
        oauth2Client.setCredentials(tokens);

        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token!,
          audience: googleClientId,
        });
        const payload = ticket.getPayload();

        if (req.session) {
          req.session.user = {
            id: payload?.sub,
            email: payload?.email,
            name: payload?.name,
            picture: payload?.picture
          };
        }

        // Multi-user initialization
        if (supabaseDb && payload?.sub) {
          // 1. Upsert user
          await supabaseDb.from('users').upsert({
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture
          });

          // 2. Ensure default project exists for this user
          const { data: projects } = await supabaseDb
            .from('project_settings')
            .select('id')
            .eq('user_id', payload.sub)
            .limit(1);

          if (!projects || projects.length === 0) {
            await supabaseDb.from('project_settings').insert({
              user_id: payload.sub,
              name: 'Main Workspace',
              brief: 'Your primary creative environment.',
              global_style: 'Modern, Clean, Minimalist'
            });
          }
        }

        res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
      } catch (error: any) {
        console.error("OAuth callback error details:", error);
        const message = error.message || "Authentication failed";
        res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
            <h2 style="margin-top: 0;">Authentication Failed</h2>
            <p><strong>Error:</strong> ${message}</p>
            <p style="font-size: 0.8rem; opacity: 0.8;">Check your Google Client ID and Secret in AI Studio Secrets. Also ensure your Redirect URI is correctly configured in the Google Cloud Console.</p>
            <button onclick="window.close()" style="padding: 0.5rem 1rem; background: #721c24; color: white; border: none; border-radius: 4px; cursor: pointer;">Close Window</button>
          </body>
        </html>
      `);
      }
    });

    app.get("/api/me", (req, res) => {
      res.json(req.session?.user || null);
    });

    app.post("/api/logout", (req, res) => {
      req.session = null;
      res.json({ success: true });
    });

    // Ensure all data is linked to a valid project
    db.exec(`
    UPDATE generations SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
    UPDATE styles SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
    UPDATE palettes SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
    UPDATE references_images SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
    UPDATE showcase SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
    UPDATE prompt_library SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings);
  `);

    // Global Search
    app.get("/api/search", requireAuth, async (req, res) => {
      const userId = req.session?.user?.id || null;
      const q = req.query.q as string || '';
      const query = `%${q}%`;

      // Always search SQLite first — it's the source of truth locally
      const results = {
        generations: db.prepare(`
          SELECT g.*, COALESCE(p.name, 'Unknown Project') as project_name
          FROM generations g LEFT JOIN project_settings p ON g.project_id = p.id
          WHERE (g.idea LIKE ? OR g.prompt_json LIKE ?) AND g.user_id IS ?
        `).all(query, query, userId),
        library: db.prepare(`
          SELECT l.*, COALESCE(p.name, 'Unknown Project') as project_name
          FROM prompt_library l LEFT JOIN project_settings p ON l.project_id = p.id
          WHERE (l.title LIKE ? OR l.prompt LIKE ?)
        `).all(query, query),
        projects: db.prepare("SELECT * FROM project_settings WHERE (name LIKE ? OR brief LIKE ?) AND user_id IS ?").all(query, query, userId)
      };
      const hasLocalResults = (results.generations as any[]).length > 0 || (results.library as any[]).length > 0 || (results.projects as any[]).length > 0;
      if (hasLocalResults) return res.json(results);

      // Fall back to Supabase only if SQLite has nothing (Cloud Run scenario)
      if (supabaseDb && userId) {
        try {
          const [generations, library, projects] = await Promise.all([
            supabaseDb.from('generations').select('*, project_settings(name)').or(`idea.ilike.%${q}%,prompt_json.ilike.%${q}%`).eq('user_id', userId),
            supabaseDb.from('prompt_library').select('*, project_settings(name)').or(`title.ilike.%${q}%,prompt.ilike.%${q}%`),
            supabaseDb.from('project_settings').select('*').or(`name.ilike.%${q}%,brief.ilike.%${q}%`).eq('user_id', userId)
          ]);
          return res.json({
            generations: generations.data?.map((g: any) => ({ ...g, project_name: g.project_settings?.name || 'Unknown Project' })) || [],
            library: library.data?.map((l: any) => ({ ...l, project_name: l.project_settings?.name || 'Unknown Project' })) || [],
            projects: projects.data || []
          });
        } catch (_) {}
      }
      res.json(results);
    });

    // Project Stats
    app.get("/api/projects/stats", requireAuth, async (req, res) => {
      const userId = req.session?.user?.id || null;
      const localStats = db.prepare(`
        SELECT p.id, p.name,
          (SELECT COUNT(*) FROM generations WHERE project_id=p.id AND user_id IS ?) as generation_count,
          (SELECT COUNT(*) FROM prompt_library WHERE project_id=p.id AND user_id IS ?) as library_count,
          (SELECT COUNT(*) FROM references_images WHERE project_id=p.id AND user_id IS ?) as reference_count
        FROM project_settings p WHERE p.user_id IS ?
      `).all(userId, userId, userId, userId);
      if ((localStats as any[]).length > 0) return res.json(localStats);

      // Supabase fallback for Cloud Run
      if (supabaseDb && userId) {
        try {
          const { data: stats, error } = await supabaseDb.from('project_settings')
            .select('id, name, generations:generations(count), library:prompt_library(count), references:references_images(count)')
            .eq('user_id', userId);
          if (!error && stats) {
            return res.json(stats.map((s: any) => ({
              id: s.id, name: s.name,
              generation_count: s.generations?.[0]?.count || 0,
              library_count: s.library?.[0]?.count || 0,
              reference_count: s.references?.[0]?.count || 0
            })));
          }
        } catch (_) {}
      }
      res.json([]);
    });

    // API Routes

    app.get("/api/generations", requireAuth, async (req, res) => {
      const userId = req.session?.user?.id || null;
      const projectId = parseInt(req.query.projectId as string) || 1;

      // SQLite-first: always check local DB. Only fall back to Supabase if empty
      // (this handles Cloud Run where SQLite resets on redeploy).
      const localRows = db.prepare("SELECT * FROM generations WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
      if (localRows.length > 0) return res.json(localRows);

      if (supabaseDb && userId) {
        try {
          const { data, error } = await supabaseDb
            .from('generations').select('*')
            .eq('project_id', projectId).eq('user_id', userId)
            .order('created_at', { ascending: false });
          if (!error && data) {
            const mapped = data.map((g: any) => ({ ...g, image_data: g.image_url || g.image_data }));
            return res.json(mapped);
          }
        } catch (_) {}
      }
      res.json([]);
    });

    app.post("/api/generations", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references } = req.body;

        if (!image_data) {
          console.error("Missing image_data in generation request");
          return res.status(400).json({ error: "Missing image_data" });
        }

        // SQLite-first: write immediately, return canonical SQLite ID
        const info = db.prepare(
          "INSERT INTO generations (user_id, idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(userId, idea, prompt_json, image_data, parent_id || null, project_id || 1, feedback || null, batch_id || null, selected_references || null);
        res.json({ id: info.lastInsertRowid });

        // Background sync to Supabase (fire-and-forget)
        if (supabaseDb) {
          (async () => {
            try {
              let imageUrl: string | null = null;
              if (image_data.startsWith('data:image')) {
                imageUrl = await uploadToSupabase(image_data, 'promptphotos', `${userId}/gen_${Date.now()}.png`);
              }
              const { error } = await supabaseDb!
                .from('generations')
                .insert([{
                  user_id: userId, idea, prompt_json,
                  image_url: imageUrl,
                  image_data: imageUrl ? null : image_data,
                  parent_id: parent_id || null,
                  project_id: project_id || 1,
                  feedback: feedback || null,
                  batch_id: batch_id || null,
                  selected_references: selected_references || null
                }]);
              if (error) console.error("Supabase generation sync failed:", error.message);
              else if (imageUrl) {
                // Update SQLite row with the cloud image_url for future reference
                db.prepare("UPDATE generations SET image_url = ? WHERE rowid = ?").run(imageUrl, info.lastInsertRowid);
              }
            } catch (err) { console.error("Supabase generation sync error:", err); }
          })();
        }
      } catch (error) {
        console.error("Failed to save generation:", error);
        res.status(500).json({ error: "Internal server error saving generation", details: error instanceof Error ? error.message : String(error) });
      }
    });

    app.get("/api/styles", requireAuth, async (req, res) => {
      const userId = req.session?.user?.id || null;
      const projectId = parseInt(req.query.projectId as string) || 1;
      const localRows = db.prepare("SELECT * FROM styles WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
      if (localRows.length > 0) return res.json(localRows);
      if (supabaseDb && userId) {
        try {
          const { data, error } = await supabaseDb.from('styles').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false });
          if (!error && data) return res.json(data);
        } catch (_) {}
      }
      res.json([]);
    });

    app.post("/api/styles", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { name, style_json, project_id } = req.body;
        // SQLite-first
        const info = db.prepare("INSERT INTO styles (user_id, name, style_json, project_id) VALUES (?, ?, ?, ?)").run(userId, name, style_json, project_id || 1);
        res.json({ id: info.lastInsertRowid });
        if (supabaseDb) {
          supabaseDb.from('styles').insert([{ user_id: userId, name, style_json, project_id: project_id || 1 }])
            .then(({ error }: any) => { if (error) console.error("Supabase style sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase style sync error:", err));
        }
      } catch (error) { res.status(500).json({ error: "Failed to save style" }); }
    });

    // Palettes
    app.get("/api/palettes", requireAuth, async (req, res) => {
      try {
        const userId = req.session?.user?.id || null;
        const projectId = parseInt(req.query.projectId as string) || 1;
        const localRows = db.prepare("SELECT * FROM palettes WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
        if (localRows.length > 0) return res.json(localRows);
        if (supabaseDb && userId) {
          try {
            const { data, error } = await supabaseDb.from('palettes').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false });
            if (!error && data) return res.json(data.map((p: any) => ({ ...p, image_data: p.image_url || p.image_data })));
          } catch (_) {}
        }
        res.json([]);
      } catch (error) {
        console.error("Error fetching palettes:", error);
        res.status(500).json({ error: "Failed to fetch palettes" });
      }
    });

    app.post("/api/palettes", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { name, image_data, project_id } = req.body;
        // SQLite-first: write immediately, return canonical SQLite ID
        const info = db.prepare("INSERT INTO palettes (user_id, name, image_data, project_id) VALUES (?, ?, ?, ?)").run(userId, name, image_data, project_id || 1);
        res.json({ id: info.lastInsertRowid });
        // Background sync to Supabase
        if (supabaseDb) {
          (async () => {
            try {
              let imageUrl: string | null = null;
              if (image_data && image_data.startsWith('data:image')) {
                imageUrl = await uploadToSupabase(image_data, 'promptphotos', `${userId}/pal_${Date.now()}.png`);
              }
              const { error } = await supabaseDb!.from('palettes')
                .insert([{ user_id: userId, name, image_url: imageUrl, image_data: imageUrl ? null : image_data, project_id: project_id || 1 }]);
              if (error) console.error("Supabase palette sync failed:", error.message);
              else if (imageUrl) db.prepare("UPDATE palettes SET image_url = ? WHERE rowid = ?").run(imageUrl, info.lastInsertRowid);
            } catch (err) { console.error("Supabase palette sync error:", err); }
          })();
        }
      } catch (error) {
        console.error("Error saving palette:", error);
        res.status(500).json({ error: "Failed to save palette" });
      }
    });

    // References
    app.get("/api/references", requireAuth, async (req, res) => {
      try {
        const userId = req.session?.user?.id || null;
        const projectId = parseInt(req.query.projectId as string) || 1;
        const localRows = db.prepare("SELECT * FROM references_images WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
        if (localRows.length > 0) return res.json(localRows);
        if (supabaseDb && userId) {
          try {
            const { data, error } = await supabaseDb.from('references_images').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false });
            if (!error && data) return res.json(data.map((r: any) => ({ ...r, image_data: r.image_url || r.image_data })));
          } catch (_) {}
        }
        res.json([]);
      } catch (error) {
        console.error("Error fetching references:", error);
        res.status(500).json({ error: "Failed to fetch references" });
      }
    });

    app.post("/api/references", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { name, image_data, project_id } = req.body;
        // SQLite-first: write immediately, return canonical SQLite ID
        const info = db.prepare("INSERT INTO references_images (user_id, name, image_data, project_id) VALUES (?, ?, ?, ?)").run(userId, name, image_data, project_id || 1);
        res.json({ id: info.lastInsertRowid });
        // Background sync to Supabase
        if (supabaseDb) {
          (async () => {
            try {
              let imageUrl: string | null = null;
              if (image_data && image_data.startsWith('data:image')) {
                imageUrl = await uploadToSupabase(image_data, 'promptphotos', `${userId}/ref_${Date.now()}.png`);
              }
              const { error } = await supabaseDb!.from('references_images')
                .insert([{ user_id: userId, name, image_url: imageUrl, image_data: imageUrl ? null : image_data, project_id: project_id || 1 }]);
              if (error) console.error("Supabase reference sync failed:", error.message);
              else if (imageUrl) db.prepare("UPDATE references_images SET image_url = ? WHERE rowid = ?").run(imageUrl, info.lastInsertRowid);
            } catch (err) { console.error("Supabase reference sync error:", err); }
          })();
        }
      } catch (error) {
        console.error("Error saving reference:", error);
        res.status(500).json({ error: "Failed to save reference" });
      }
    });

    // Showcase
    app.get("/api/showcase", requireAuth, async (req, res) => {
      try {
        const userId = req.session?.user?.id || null;
        const projectId = parseInt(req.query.projectId as string) || 1;
        const showcaseQuery = `
          SELECT s.*,
            CASE WHEN s.type='generation' THEN g.image_data WHEN s.type='reference' THEN r.image_data WHEN s.type='palette' THEN p.image_data ELSE NULL END as image_preview,
            CASE WHEN s.type='generation' THEN g.idea WHEN s.type='reference' THEN r.name WHEN s.type='palette' THEN p.name END as title
          FROM showcase s
          LEFT JOIN generations g ON s.type='generation' AND s.item_id=g.id
          LEFT JOIN references_images r ON s.type='reference' AND s.item_id=r.id
          LEFT JOIN palettes p ON s.type='palette' AND s.item_id=p.id
          WHERE s.project_id=? AND s.user_id IS ?
          ORDER BY s.created_at DESC`;
        const localRows = db.prepare(showcaseQuery).all(projectId, userId);
        if (localRows.length > 0) return res.json(localRows);
        // Supabase fallback (for Cloud Run)
        if (supabaseDb && userId) {
          try {
            const { data: showcase, error } = await supabaseDb.from('showcase')
              .select('*, generations(image_data,image_url,idea), references_images(image_data,name), palettes(image_data,image_url,name)')
              .eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false });
            if (!error && showcase) {
              return res.json(showcase.map((s: any) => ({
                ...s,
                image_preview: s.type === 'generation' ? (s.generations?.image_url || s.generations?.image_data) : s.type === 'reference' ? s.references_images?.image_data : (s.palettes?.image_url || s.palettes?.image_data),
                title: s.type === 'generation' ? s.generations?.idea : s.type === 'reference' ? s.references_images?.name : s.palettes?.name
              })));
            }
          } catch (_) {}
        }
        res.json([]);
      } catch (error) {
        console.error("Error fetching showcase:", error);
        res.status(500).json({ error: "Failed to fetch showcase" });
      }
    });

    app.post("/api/showcase", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { type, item_id, project_id } = req.body;
        // SQLite-first
        const info = db.prepare("INSERT INTO showcase (user_id, type, item_id, project_id) VALUES (?, ?, ?, ?)").run(userId, type, item_id, project_id || 1);
        res.json({ id: info.lastInsertRowid });
        if (supabaseDb) {
          supabaseDb.from('showcase').insert([{ user_id: userId, type, item_id, project_id: project_id || 1 }])
            .then(({ error }: any) => { if (error) console.error("Supabase showcase sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase showcase sync error:", err));
        }
      } catch (error) { res.status(500).json({ error: "Failed to add to showcase" }); }
    });

    app.post("/api/showcase/:id/star", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        // Update SQLite first
        db.prepare("UPDATE showcase SET starred = 1 - starred WHERE id = ? AND user_id = ?").run(req.params.id, userId);
        res.json({ success: true });
        // Background sync to Supabase
        if (supabaseDb) {
          const { data: current } = await supabaseDb.from('showcase').select('starred').eq('id', req.params.id).eq('user_id', userId).single();
          supabaseDb.from('showcase').update({ starred: !current?.starred }).eq('id', req.params.id).eq('user_id', userId)
            .then(({ error }: any) => { if (error) console.error("Supabase star sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase star sync error:", err));
        }
      } catch (error) { res.status(500).json({ error: "Failed to toggle star" }); }
    });

    // Comments
    app.get("/api/showcase/:id/comments", async (req, res) => {
      const localRows = db.prepare("SELECT * FROM comments WHERE showcase_id = ? ORDER BY created_at ASC").all(req.params.id);
      if (localRows.length > 0) return res.json(localRows);
      if (supabaseDb) {
        try {
          const { data, error } = await supabaseDb.from('comments').select('*').eq('showcase_id', req.params.id).order('created_at', { ascending: true });
          if (!error && data) return res.json(data);
        } catch (_) {}
      }
      res.json([]);
    });

    app.post("/api/showcase/:id/comments", async (req, res) => {
      try {
        const { text, author } = req.body;
        // SQLite-first
        const info = db.prepare("INSERT INTO comments (showcase_id, text, author) VALUES (?, ?, ?)").run(req.params.id, text, author);
        res.json({ id: info.lastInsertRowid });
        if (supabaseDb) {
          supabaseDb.from('comments').insert([{ showcase_id: req.params.id, text, author }])
            .then(({ error }: any) => { if (error) console.error("Supabase comment sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase comment sync error:", err));
        }
      } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ error: "Failed to add comment" });
      }
    });

    // Project Settings
    app.get("/api/projects", requireAuth, async (req, res) => {
      try {
        const userId = req.session?.user?.id || null;
        const localRows = db.prepare("SELECT * FROM project_settings WHERE user_id IS ? ORDER BY updated_at DESC").all(userId);
        if (localRows.length > 0) return res.json(localRows);
        if (supabaseDb && userId) {
          try {
            const { data, error } = await supabaseDb.from('project_settings').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
            if (!error && data) return res.json(data);
          } catch (_) {}
        }
        res.json([]);
      } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).json({ error: "Failed to fetch projects" });
      }
    });

    app.get("/api/projects/:id", requireAuth, async (req, res) => {
      try {
        const userId = req.session?.user?.id || null;
        const localRow = db.prepare("SELECT * FROM project_settings WHERE id = ? AND user_id IS ?").get(req.params.id, userId);
        if (localRow) return res.json(localRow);
        if (supabaseDb && userId) {
          try {
            const { data, error } = await supabaseDb.from('project_settings').select('*').eq('id', req.params.id).eq('user_id', userId).maybeSingle();
            if (!error) return res.json(data || null);
          } catch (_) {}
        }
        res.json(null);
      } catch (error) {
        console.error("Error fetching project settings:", error);
        res.status(500).json({ error: "Failed to fetch project settings" });
      }
    });

    app.post("/api/projects", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { name, brief, global_style } = req.body;
        // SQLite-first: SQLite ID is the canonical ID used everywhere
        const info = db.prepare("INSERT INTO project_settings (user_id, name, brief, global_style) VALUES (?, ?, ?, ?)")
          .run(userId, name || 'New Project', brief || '', global_style || '');
        res.json({ id: info.lastInsertRowid });
        // Background sync to Supabase (fire-and-forget)
        if (supabaseDb) {
          supabaseDb.from('project_settings')
            .insert([{ user_id: userId, name: name || 'New Project', brief: brief || '', global_style: global_style || '' }])
            .then(({ error }: any) => { if (error) console.error("Supabase project create sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase project create sync error:", err));
        }
      } catch (error) {
        console.error("Error creating project:", error);
        res.status(500).json({ error: "Failed to create project" });
      }
    });

    app.post("/api/projects/:id", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { name, brief, global_style } = req.body;
        // Update SQLite first — always succeeds
        db.prepare("UPDATE project_settings SET name = ?, brief = ?, global_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .run(name, brief, global_style, req.params.id, userId);
        res.json({ success: true });
        // Background sync to Supabase
        if (supabaseDb) {
          supabaseDb.from('project_settings').update({ name, brief, global_style, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', userId)
            .then(({ error }: any) => { if (error) console.error("Supabase project update sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase project update sync error:", err));
        }
      } catch (error) {
        console.error("Error updating project settings:", error);
        res.status(500).json({ error: "Failed to update project settings" });
      }
    });

    app.delete("/api/generations/:id", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      // Delete from SQLite first — always succeeds
      db.prepare("DELETE FROM generations WHERE id = ? AND user_id = ?").run(req.params.id, userId);
      res.json({ success: true });
      // Background sync delete to Supabase
      if (supabaseDb) {
        supabaseDb.from('generations').delete().eq('id', req.params.id).eq('user_id', userId)
          .then(({ error }: any) => { if (error) console.error("Supabase generation delete sync failed:", error.message); })
          .catch((err: any) => console.error("Supabase generation delete sync error:", err));
      }
    });

    // Prompt Library - SHARED across the agency
    app.get("/api/library", requireAuth, async (req, res) => {
      // Shared library — no user_id filter; check SQLite first
      const localRows = db.prepare("SELECT * FROM prompt_library ORDER BY category ASC, title ASC").all();
      if (localRows.length > 0) return res.json(localRows);
      if (supabaseDb) {
        try {
          const { data, error } = await supabaseDb.from('prompt_library').select('*').order('category', { ascending: true }).order('title', { ascending: true });
          if (!error && data) return res.json(data);
        } catch (_) {}
      }
      res.json([]);
    });

    app.post("/api/library", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { category, title, prompt, project_id } = req.body;
        if (supabaseDb) {
          try {
            const { data, error } = await supabaseDb.from('prompt_library')
              .insert([{ user_id: userId, category, title, prompt, project_id: project_id || 1 }])
              .select('id').single();
            if (!error) {
              try { db.prepare("INSERT INTO prompt_library (user_id, category, title, prompt, project_id) VALUES (?, ?, ?, ?, ?)").run(userId, category, title, prompt, project_id || 1); } catch (_) {}
              return res.json({ id: data.id });
            }
            console.error("Supabase library insert failed, using SQLite fallback:", error.message);
          } catch (supaErr) { console.error("Supabase library write error, using SQLite fallback:", supaErr); }
        }
        const info = db.prepare("INSERT INTO prompt_library (user_id, category, title, prompt, project_id) VALUES (?, ?, ?, ?, ?)").run(userId, category, title, prompt, project_id || 1);
        res.json({ id: info.lastInsertRowid });
      } catch (error) { res.status(500).json({ error: "Failed to save library item" }); }
    });

    app.post("/api/library/import", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { items } = req.body;

        // Always write to SQLite first — this is the guaranteed path
        const insert = db.prepare("INSERT INTO prompt_library (user_id, category, title, prompt, project_id) VALUES (?, ?, ?, ?, ?)");
        const transaction = db.transaction((items: any[]) => {
          for (const item of items) {
            insert.run(userId, item.category, item.title, item.prompt, item.project_id || 1);
          }
        });
        transaction(items);
        res.json({ success: true });

        // Background sync to Supabase
        if (supabaseDb) {
          supabaseDb.from('prompt_library').insert(
            items.map((item: any) => ({ user_id: userId, category: item.category, title: item.title, prompt: item.prompt, project_id: item.project_id || 1 }))
          ).then(({ error }: any) => { if (error) console.error("Supabase library import sync failed:", error.message); })
            .catch((err: any) => console.error("Supabase library import sync error:", err));
        }
      } catch (error) {
        console.error("Library import failed:", error);
        res.status(500).json({ error: "Failed to import library items" });
      }
    });

    app.delete("/api/library/:id", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      // Delete from SQLite first — always succeeds
      db.prepare("DELETE FROM prompt_library WHERE id = ? AND user_id = ?").run(req.params.id, userId);
      res.json({ success: true });
      // Background sync delete to Supabase
      if (supabaseDb) {
        supabaseDb.from('prompt_library').delete().eq('id', req.params.id).eq('user_id', userId)
          .then(({ error }: any) => { if (error) console.error("Supabase library delete sync failed:", error.message); })
          .catch((err: any) => console.error("Supabase library delete sync error:", err));
      }
    });

    // Privacy: Purge Server Database
    app.post("/api/purge", requireAuth, (req, res) => {
      const userId = req.session.user.id;
      try {
        db.prepare("DELETE FROM showcase WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM references_images WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM palettes WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM prompt_library WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM styles WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM generations WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM project_settings WHERE user_id = ?").run(userId);

        res.json({ success: true, message: "Your data has been purged successfully." });
      } catch (error) {
        console.error("Purge failed:", error);
        res.status(500).json({ error: "Purge failed" });
      }
    });

    // Export/Import
    app.get("/api/export", requireAuth, (req, res) => {
      const userId = req.session.user.id;
      try {
        const data = {
          projects: db.prepare("SELECT * FROM project_settings WHERE user_id = ?").all(userId),
          generations: db.prepare("SELECT * FROM generations WHERE user_id = ?").all(userId),
          library: db.prepare("SELECT * FROM prompt_library WHERE user_id = ?").all(userId),
          palettes: db.prepare("SELECT * FROM palettes WHERE user_id = ?").all(userId),
          references: db.prepare("SELECT * FROM references_images WHERE user_id = ?").all(userId),
          showcase: db.prepare("SELECT * FROM showcase WHERE user_id = ?").all(userId),
          styles: db.prepare("SELECT * FROM styles WHERE user_id = ?").all(userId),
        };
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: "Export failed" });
      }
    });

    app.post("/api/import", requireAuth, (req, res) => {
      const userId = req.session.user.id;
      try {
        const data = req.body;
        const transaction = db.transaction((data) => {
          db.prepare("DELETE FROM showcase WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM references_images WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM palettes WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM prompt_library WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM styles WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM generations WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM project_settings WHERE user_id = ?").run(userId);

          // Restore projects
          const insProject = db.prepare("INSERT INTO project_settings (user_id, name, brief, global_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const p of data.projects || []) {
            insProject.run(userId, p.name, p.brief, p.global_style, p.created_at, p.updated_at);
          }

          // Restore generations
          const insGen = db.prepare("INSERT INTO generations (user_id, project_id, idea, prompt_json, image_data, parent_id, feedback, batch_id, selected_references, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const g of data.generations || []) {
            insGen.run(userId, g.project_id, g.idea, g.prompt_json, g.image_data, g.parent_id, g.feedback, g.batch_id, g.selected_references, g.created_at);
          }

          // Restore library
          const insLib = db.prepare("INSERT INTO prompt_library (user_id, project_id, category, title, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const l of data.library || []) {
            insLib.run(userId, l.project_id, l.category, l.title, l.prompt, l.created_at);
          }

          // Restore palettes
          const insPal = db.prepare("INSERT INTO palettes (user_id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const p of data.palettes || []) {
            insPal.run(userId, p.project_id, p.name, p.image_data, p.created_at);
          }

          // Restore references
          const insRef = db.prepare("INSERT INTO references_images (user_id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const r of data.references || []) {
            insRef.run(userId, r.project_id, r.name, r.image_data, r.created_at);
          }

          // Restore showcase
          const insShow = db.prepare("INSERT INTO showcase (user_id, project_id, type, item_id, starred, created_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const s of data.showcase || []) {
            insShow.run(userId, s.project_id, s.type, s.item_id, s.starred, s.created_at);
          }

          // Restore styles
          const insStyle = db.prepare("INSERT INTO styles (user_id, project_id, name, style_json, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const s of data.styles || []) {
            insStyle.run(userId, s.project_id, s.name, s.style_json, s.created_at);
          }
        });

        transaction(data);
        res.json({ success: true });
      } catch (error) {
        console.error("Import failed:", error);
        res.status(500).json({ error: "Import failed", details: error instanceof Error ? error.message : String(error) });
      }
    });

    // Health check — reports Supabase + GCS status
    app.get("/api/health", async (req, res) => {
      const health: any = {
        sqlite: true,
        supabase: false,
        supabaseMode: null,
        gcs: !!bucket,
        timestamp: new Date().toISOString()
      };
      if (supabaseDb) {
        const { error } = await supabaseDb.from('users').select('id', { count: 'exact', head: true }).limit(1);
        health.supabase = !error;
        health.supabaseMode = supabaseAdmin ? 'service_role' : 'anon_key';
        if (error) health.supabaseError = error.message;
      }
      res.json(health);
    });

    // Rescue endpoint — reads from browser IndexedDB backup
    app.get("/api/rescue", requireAuth, (req, res) => {
      const userId = req.session?.user?.id || null;
      try {
        const data = {
          projects: db.prepare("SELECT * FROM project_settings WHERE user_id IS ?").all(userId),
          generations: db.prepare("SELECT * FROM generations WHERE user_id IS ?").all(userId),
          library: db.prepare("SELECT * FROM prompt_library WHERE user_id IS ?").all(userId),
          palettes: db.prepare("SELECT * FROM palettes WHERE user_id IS ?").all(userId),
          references: db.prepare("SELECT * FROM references_images WHERE user_id IS ?").all(userId),
          showcase: db.prepare("SELECT * FROM showcase WHERE user_id IS ?").all(userId),
          styles: db.prepare("SELECT * FROM styles WHERE user_id IS ?").all(userId),
        };
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: "Rescue failed" });
      }
    });

    // ── Agency: Client Shares ──────────────────────────────────────────────

    // List shares for current user
    app.get("/api/shares", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      if (supabaseDb) {
        const { data, error } = await supabaseDb
          .from('client_shares').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM client_shares WHERE user_id = ? ORDER BY created_at DESC").all(userId);
      res.json(rows);
    });

    // Create a share link
    app.post("/api/shares", requireAuth, async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { project_id, label, expires_in_days } = req.body;
        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        const expires_at = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000).toISOString() : null;
        if (supabaseDb) {
          try {
            const { data, error } = await supabaseDb.from('client_shares')
              .insert([{ user_id: userId, project_id, token, label: label || null, expires_at }])
              .select('id, token').single();
            if (!error) {
              try { db.prepare("INSERT INTO client_shares (user_id, project_id, token, label, expires_at) VALUES (?, ?, ?, ?, ?)").run(userId, project_id, token, label || null, expires_at); } catch (_) {}
              return res.json(data);
            }
            console.error("Supabase share create failed, using SQLite fallback:", error.message);
          } catch (supaErr) { console.error("Supabase share create error, using SQLite fallback:", supaErr); }
        }
        const info = db.prepare("INSERT INTO client_shares (user_id, project_id, token, label, expires_at) VALUES (?, ?, ?, ?, ?)").run(userId, project_id, token, label || null, expires_at);
        res.json({ id: info.lastInsertRowid, token });
      } catch (error) { res.status(500).json({ error: "Failed to create share" }); }
    });

    // Delete a share
    app.delete("/api/shares/:id", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      // Delete from SQLite first — always succeeds
      db.prepare("DELETE FROM client_shares WHERE id = ? AND user_id = ?").run(req.params.id, userId);
      res.json({ success: true });
      // Background sync delete to Supabase
      if (supabaseDb) {
        supabaseDb.from('client_shares').delete().eq('id', req.params.id).eq('user_id', userId)
          .then(({ error }: any) => { if (error) console.error("Supabase share delete sync failed:", error.message); })
          .catch((err: any) => console.error("Supabase share delete sync error:", err));
      }
    });

    // Public client view — no auth required, token-gated
    app.get("/api/share/:token", async (req, res) => {
      const now = new Date().toISOString();
      let share: any = null;
      if (supabaseDb) {
        const { data } = await supabaseDb.from('client_shares').select('*').eq('token', req.params.token).single();
        share = data;
      } else {
        share = db.prepare("SELECT * FROM client_shares WHERE token = ?").get(req.params.token);
      }
      if (!share) return res.status(404).json({ error: "Share not found" });
      if (share.expires_at && share.expires_at < now) return res.status(410).json({ error: "This link has expired" });

      // Fetch the project + its starred showcase items
      let project: any = null;
      let items: any[] = [];
      if (supabaseDb) {
        const { data: p } = await supabaseDb.from('project_settings').select('*').eq('id', share.project_id).single();
        project = p;
        const { data: s } = await supabaseDb
          .from('showcase').select(`*, generations(image_data,image_url,idea), palettes(image_data,image_url,name), references_images(image_data,name)`)
          .eq('project_id', share.project_id).eq('starred', true);
        items = (s || []).map((sc: any) => {
          const img = sc.type === 'generation' ? (sc.generations?.image_url || sc.generations?.image_data) :
            sc.type === 'palette' ? (sc.palettes?.image_url || sc.palettes?.image_data) : sc.references_images?.image_data;
          const title = sc.type === 'generation' ? sc.generations?.idea : sc.type === 'palette' ? sc.palettes?.name : sc.references_images?.name;
          return { ...sc, image_preview: img, title };
        });
      } else {
        project = db.prepare("SELECT * FROM project_settings WHERE id = ?").get(share.project_id);
        items = db.prepare(`
          SELECT s.*, g.image_data as img_g, g.idea as title_g, p.image_data as img_p, p.name as title_p, r.image_data as img_r, r.name as title_r
          FROM showcase s
          LEFT JOIN generations g ON s.type='generation' AND s.item_id=g.id
          LEFT JOIN palettes p ON s.type='palette' AND s.item_id=p.id
          LEFT JOIN references_images r ON s.type='reference' AND s.item_id=r.id
          WHERE s.project_id=? AND s.starred=1
        `).all(share.project_id);
      }
      res.json({ share: { label: share.label, token: share.token }, project, items });
    });

    app.post("/api/sync", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      try {
        const data = {
          projects: db.prepare("SELECT * FROM project_settings WHERE user_id = ?").all(userId),
          generations: db.prepare("SELECT * FROM generations WHERE user_id = ?").all(userId),
          library: db.prepare("SELECT * FROM prompt_library WHERE user_id = ?").all(userId),
          palettes: db.prepare("SELECT * FROM palettes WHERE user_id = ?").all(userId),
          references: db.prepare("SELECT * FROM references_images WHERE user_id = ?").all(userId),
          showcase: db.prepare("SELECT * FROM showcase WHERE user_id = ?").all(userId),
          styles: db.prepare("SELECT * FROM styles WHERE user_id = ?").all(userId),
        };
        await saveToGCS(userId, data);
        res.json({ success: true });
      } catch (error) {
        console.error("Sync to GCS failed:", error);
        res.status(500).json({ error: "Sync failed" });
      }
    });

    app.post("/api/restore", requireAuth, async (req, res) => {
      const userId = req.session.user.id;
      try {
        const data = await loadFromGCS(userId);
        if (!data) {
          return res.status(404).json({ error: "No backup found in GCS" });
        }

        const transaction = db.transaction((data) => {
          db.prepare("DELETE FROM showcase WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM references_images WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM palettes WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM prompt_library WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM styles WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM generations WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM project_settings WHERE user_id = ?").run(userId);

          const insProject = db.prepare("INSERT INTO project_settings (user_id, name, brief, global_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const p of data.projects || []) insProject.run(userId, p.name, p.brief, p.global_style, p.created_at, p.updated_at);

          const insGen = db.prepare("INSERT INTO generations (user_id, project_id, idea, prompt_json, image_data, parent_id, feedback, batch_id, selected_references, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const g of data.generations || []) insGen.run(userId, g.project_id, g.idea, g.prompt_json, g.image_data, g.parent_id, g.feedback, g.batch_id, g.selected_references, g.created_at);

          const insLib = db.prepare("INSERT INTO prompt_library (user_id, project_id, category, title, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const l of data.library || []) insLib.run(userId, l.project_id, l.category, l.title, l.prompt, l.created_at);

          const insPal = db.prepare("INSERT INTO palettes (user_id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const p of data.palettes || []) insPal.run(userId, p.project_id, p.name, p.image_data, p.created_at);

          const insRef = db.prepare("INSERT INTO references_images (user_id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const r of data.references || []) insRef.run(userId, r.project_id, r.name, r.image_data, r.created_at);

          const insShow = db.prepare("INSERT INTO showcase (user_id, project_id, type, item_id, starred, created_at) VALUES (?, ?, ?, ?, ?, ?)");
          for (const s of data.showcase || []) insShow.run(userId, s.project_id, s.type, s.item_id, s.starred, s.created_at);

          const insStyle = db.prepare("INSERT INTO styles (user_id, project_id, name, style_json, created_at) VALUES (?, ?, ?, ?, ?)");
          for (const s of data.styles || []) insStyle.run(userId, s.project_id, s.name, s.style_json, s.created_at);
        });

        transaction(data);
        res.json({ success: true });
      } catch (error) {
        console.error("Restore from GCS failed:", error);
        res.status(500).json({ error: "Restore failed" });
      }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      try {
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } catch (e) {
        console.error("Vite server creation failed:", e);
      }
    } else {
      app.use(express.static(path.join(__dirname, "dist")));
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "dist", "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();
