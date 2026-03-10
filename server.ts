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

// Supabase Client (if configured)
const supabaseUrl = process.env.SUPABASE_URL || "https://snwofoypavgrcpdpymlj.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNud29mb3lwYXZncmNwZHB5bWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDg5NDgsImV4cCI6MjA4ODcyNDk0OH0.h2Swp87Sfuq_2sGLud4brsIhDwCj_I0TLkflVFJ5-JY";
let supabase: any = null;

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("http")) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.error("Supabase initialization failed:", err);
    supabase = null;
  }
}

if (supabase) {
  console.log("Supabase (Persistent Postgres) configured.");
} else {
  console.log("Using local SQLite (Ephemeral). Add SUPABASE_URL and SUPABASE_ANON_KEY for persistence.");
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
}
if (bucket) {
  console.log(`Google Cloud Storage configured: ${gcsBucketName}`);
}

// Initialize database
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
    type TEXT, -- 'generation', 'palette', 'reference'
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

try {
  db.prepare("ALTER TABLE palettes ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE references_images ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN feedback TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE generations ADD COLUMN batch_id TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE generations ADD COLUMN selected_references TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE palettes ADD COLUMN image_data TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN parent_id INTEGER").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE showcase ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE styles ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE prompt_library ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieSession({
    name: 'session',
    keys: [sessionSecret],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none'
  }));

  // Auth Routes
  app.get("/api/auth/url", (req, res) => {
    if (!oauth2Client) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
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
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
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
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.status(500).send("Authentication failed");
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
  app.get("/api/search", (req, res) => {
    const query = `%${req.query.q || ''}%`;
    const results = {
      generations: db.prepare(`
        SELECT g.*, COALESCE(p.name, 'Unknown Project') as project_name 
        FROM generations g 
        LEFT JOIN project_settings p ON g.project_id = p.id 
        WHERE g.idea LIKE ? OR g.prompt_json LIKE ?
      `).all(query, query),
      library: db.prepare(`
        SELECT l.*, COALESCE(p.name, 'Unknown Project') as project_name 
        FROM prompt_library l 
        LEFT JOIN project_settings p ON l.project_id = p.id 
        WHERE l.title LIKE ? OR l.prompt LIKE ?
      `).all(query, query),
      projects: db.prepare("SELECT * FROM project_settings WHERE name LIKE ? OR brief LIKE ?").all(query, query)
    };
    res.json(results);
  });

  // Project Stats
  app.get("/api/projects/stats", async (req, res) => {
    if (supabase) {
      const { data: stats, error } = await supabase
        .from('project_settings')
        .select(`
          id,
          name,
          generations:generations(count),
          library:prompt_library(count),
          references:references_images(count)
        `);
      
      if (error) return res.status(500).json({ error: error.message });
      
      // Format Supabase response to match SQLite
      const formattedStats = stats.map(s => ({
        id: s.id,
        name: s.name,
        generation_count: s.generations?.[0]?.count || 0,
        library_count: s.library?.[0]?.count || 0,
        reference_count: s.references?.[0]?.count || 0
      }));
      return res.json(formattedStats);
    }

    const stats = db.prepare(`
      SELECT 
        p.id,
        p.name,
        (SELECT COUNT(*) FROM generations WHERE project_id = p.id) as generation_count,
        (SELECT COUNT(*) FROM prompt_library WHERE project_id = p.id) as library_count,
        (SELECT COUNT(*) FROM references_images WHERE project_id = p.id) as reference_count
      FROM project_settings p
    `).all();
    res.json(stats);
  });

  // API Routes
  app.get("/api/rescue", (req, res) => {
    try {
      console.log("Starting Data Rescue operation...");
      // Ensure Project 1 exists
      db.prepare("INSERT OR IGNORE INTO project_settings (id, name, brief, global_style) VALUES (1, 'Main Workspace', 'Your primary creative environment.', 'Modern, Clean, Minimalist')").run();
      
      const counts = {
        generations: db.prepare("UPDATE generations SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        library: db.prepare("UPDATE prompt_library SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        palettes: db.prepare("UPDATE palettes SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        references: db.prepare("UPDATE references_images SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        showcase: db.prepare("UPDATE showcase SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
        styles: db.prepare("UPDATE styles SET project_id = 1 WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM project_settings)").run().changes,
      };
      
      const totals = {
        generations: db.prepare("SELECT COUNT(*) as count FROM generations").get().count,
        library: db.prepare("SELECT COUNT(*) as count FROM prompt_library").get().count,
        projects: db.prepare("SELECT COUNT(*) as count FROM project_settings").get().count,
      };

      console.log("Rescue complete. Fixed:", counts, "Totals:", totals);
      res.json({ success: true, fixed: counts, totals });
    } catch (error) {
      console.error("Rescue failed:", error);
      res.status(500).json({ error: "Rescue operation failed" });
    }
  });

  app.get("/api/generations", async (req, res) => {
    const projectId = parseInt(req.query.projectId as string) || 1;
    
    if (supabase) {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    const rows = db.prepare("SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
    res.json(rows);
  });

  app.post("/api/generations", async (req, res) => {
    try {
      const { idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references } = req.body;
      
      if (!image_data) {
        console.error("Missing image_data in generation request");
        return res.status(400).json({ error: "Missing image_data" });
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('generations')
          .insert([{
            idea,
            prompt_json,
            image_data,
            parent_id: parent_id || null,
            project_id: project_id || 1,
            feedback: feedback || null,
            batch_id: batch_id || null,
            selected_references: selected_references || null
          }])
          .select('id')
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
      res.status(500).json({ error: "Internal server error saving generation", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/styles", async (req, res) => {
    const projectId = parseInt(req.query.projectId as string) || 1;
    if (supabase) {
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = db.prepare("SELECT * FROM styles WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
    res.json(rows);
  });

  app.post("/api/styles", async (req, res) => {
    const { name, style_json, project_id } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('styles')
        .insert([{ name, style_json, project_id: project_id || 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare(
      "INSERT INTO styles (name, style_json, project_id) VALUES (?, ?, ?)"
    ).run(name, style_json, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  // Palettes
  app.get("/api/palettes", async (req, res) => {
    try {
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase) {
        const { data, error } = await supabase
          .from('palettes')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM palettes WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching palettes:", error);
      res.status(500).json({ error: "Failed to fetch palettes" });
    }
  });

  app.post("/api/palettes", async (req, res) => {
    try {
      const { name, image_data, project_id } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('palettes')
          .insert([{ name, image_data, project_id: project_id || 1 }])
          .select('id')
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO palettes (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving palette:", error);
      res.status(500).json({ error: "Failed to save palette" });
    }
  });

  // References
  app.get("/api/references", async (req, res) => {
    try {
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase) {
        const { data, error } = await supabase
          .from('references_images')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM references_images WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching references:", error);
      res.status(500).json({ error: "Failed to fetch references" });
    }
  });

  app.post("/api/references", async (req, res) => {
    try {
      const { name, image_data, project_id } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('references_images')
          .insert([{ name, image_data, project_id: project_id || 1 }])
          .select('id')
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO references_images (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving reference:", error);
      res.status(500).json({ error: "Failed to save reference" });
    }
  });

  // Showcase
  app.get("/api/showcase", async (req, res) => {
    try {
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase) {
        // In Supabase we use a more complex query or multiple queries
        // For simplicity, we'll fetch showcase items and then join them manually or use Supabase's relational features
        const { data: showcase, error } = await supabase
          .from('showcase')
          .select(`
            *,
            generations (image_data, idea),
            references_images (image_data, name),
            palettes (image_data, name)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const formatted = showcase.map((s: any) => {
          let image_preview = null;
          let title = null;
          if (s.type === 'generation') {
            image_preview = s.generations?.image_data;
            title = s.generations?.idea;
          } else if (s.type === 'reference') {
            image_preview = s.references_images?.image_data;
            title = s.references_images?.name;
          } else if (s.type === 'palette') {
            image_preview = s.palettes?.image_data;
            title = s.palettes?.name;
          }
          return { ...s, image_preview, title };
        });
        return res.json(formatted);
      }
      const rows = db.prepare(`
        SELECT s.*, 
               CASE 
                 WHEN s.type = 'generation' THEN g.image_data
                 WHEN s.type = 'reference' THEN r.image_data
                 WHEN s.type = 'palette' THEN p.image_data
                 ELSE NULL 
               END as image_preview,
               CASE 
                 WHEN s.type = 'generation' THEN g.idea
                 WHEN s.type = 'reference' THEN r.name
                 WHEN s.type = 'palette' THEN p.name
               END as title
        FROM showcase s
        LEFT JOIN generations g ON s.type = 'generation' AND s.item_id = g.id
        LEFT JOIN references_images r ON s.type = 'reference' AND s.item_id = r.id
        LEFT JOIN palettes p ON s.type = 'palette' AND s.item_id = p.id
        WHERE s.project_id = ?
        ORDER BY s.created_at DESC
      `).all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching showcase:", error);
      res.status(500).json({ error: "Failed to fetch showcase" });
    }
  });

  app.post("/api/showcase", async (req, res) => {
    const { type, item_id, project_id } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('showcase')
        .insert([{ type, item_id, project_id: project_id || 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO showcase (type, item_id, project_id) VALUES (?, ?, ?)").run(type, item_id, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/showcase/:id/star", async (req, res) => {
    if (supabase) {
      // Get current state
      const { data: current } = await supabase.from('showcase').select('starred').eq('id', req.params.id).single();
      const { error } = await supabase
        .from('showcase')
        .update({ starred: !current?.starred })
        .eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("UPDATE showcase SET starred = 1 - starred WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Comments
  app.get("/api/showcase/:id/comments", async (req, res) => {
    if (supabase) {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('showcase_id', req.params.id)
        .order('created_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = db.prepare("SELECT * FROM comments WHERE showcase_id = ? ORDER BY created_at ASC").all(req.params.id);
    res.json(rows);
  });

  app.post("/api/showcase/:id/comments", async (req, res) => {
    try {
      const { text, author } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('comments')
          .insert([{ showcase_id: req.params.id, text, author }])
          .select('id')
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO comments (showcase_id, text, author) VALUES (?, ?, ?)").run(req.params.id, text, author);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Project Settings
  app.get("/api/projects", async (req, res) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('project_settings')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM project_settings ORDER BY updated_at DESC").all();
      res.json(rows);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('project_settings')
          .select('*')
          .eq('id', req.params.id)
          .single();
        if (error) throw error;
        return res.json(data);
      }
      const row = db.prepare("SELECT * FROM project_settings WHERE id = ?").get(req.params.id);
      res.json(row);
    } catch (error) {
      console.error("Error fetching project settings:", error);
      res.status(500).json({ error: "Failed to fetch project settings" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('project_settings')
          .insert([{ name: name || 'New Project', brief: brief || '', global_style: global_style || '' }])
          .select('id')
          .single();
        if (error) throw error;
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO project_settings (name, brief, global_style) VALUES (?, ?, ?)")
        .run(name || 'New Project', brief || '', global_style || '');
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/projects/:id", async (req, res) => {
    try {
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { error } = await supabase
          .from('project_settings')
          .update({ name, brief, global_style, updated_at: new Date().toISOString() })
          .eq('id', req.params.id);
        if (error) throw error;
        return res.json({ success: true });
      }
      db.prepare("UPDATE project_settings SET name = ?, brief = ?, global_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name, brief, global_style, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating project settings:", error);
      res.status(500).json({ error: "Failed to update project settings" });
    }
  });

  app.delete("/api/generations/:id", async (req, res) => {
    if (supabase) {
      const { error } = await supabase.from('generations').delete().eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM generations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Prompt Library
  app.get("/api/library", async (req, res) => {
    if (supabase) {
      const { data, error } = await supabase
        .from('prompt_library')
        .select('*')
        .order('category', { ascending: true })
        .order('title', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = db.prepare("SELECT * FROM prompt_library ORDER BY category ASC, title ASC").all();
    res.json(rows);
  });

  app.post("/api/library", async (req, res) => {
    const { category, title, prompt } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('prompt_library')
        .insert([{ category, title, prompt, project_id: 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, 1)")
      .run(category, title, prompt);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/library/import", (req, res) => {
    const { items } = req.body;
    const insert = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, 1)");
    const transaction = db.transaction((items) => {
      for (const item of items) {
        insert.run(item.category, item.title, item.prompt);
      }
    });
    transaction(items);
    res.json({ success: true });
  });

  app.delete("/api/library/:id", async (req, res) => {
    if (supabase) {
      const { error } = await supabase.from('prompt_library').delete().eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM prompt_library WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Privacy: Purge Server Database
  app.post("/api/purge", (req, res) => {
    try {
      db.exec(`
        DELETE FROM comments;
        DELETE FROM showcase;
        DELETE FROM references_images;
        DELETE FROM palettes;
        DELETE FROM prompt_library;
        DELETE FROM styles;
        DELETE FROM generations;
        DELETE FROM project_settings WHERE id > 1;
        UPDATE project_settings SET name = 'Main Workspace', brief = 'Your primary creative environment.', global_style = 'Modern, Clean, Minimalist' WHERE id = 1;
      `);
      res.json({ success: true, message: "Server database purged successfully." });
    } catch (error) {
      res.status(500).json({ error: "Purge failed" });
    }
  });

  // Export/Import
  app.get("/api/export", (req, res) => {
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
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/import", (req, res) => {
    try {
      const data = req.body;
      const transaction = db.transaction((data) => {
        // Clear existing data (optional, but cleaner for a full restore)
        db.prepare("DELETE FROM comments").run();
        db.prepare("DELETE FROM showcase").run();
        db.prepare("DELETE FROM references_images").run();
        db.prepare("DELETE FROM palettes").run();
        db.prepare("DELETE FROM prompt_library").run();
        db.prepare("DELETE FROM styles").run();
        db.prepare("DELETE FROM generations").run();
        db.prepare("DELETE FROM project_settings").run();

        // Restore projects
        const insProject = db.prepare("INSERT INTO project_settings (id, name, brief, global_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const p of data.projects || []) {
          insProject.run(p.id, p.name, p.brief, p.global_style, p.created_at, p.updated_at);
        }

        // Restore generations
        const insGen = db.prepare("INSERT INTO generations (id, project_id, idea, prompt_json, image_data, parent_id, feedback, batch_id, selected_references, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        for (const g of data.generations || []) {
          insGen.run(g.id, g.project_id, g.idea, g.prompt_json, g.image_data, g.parent_id, g.feedback, g.batch_id, g.selected_references, g.created_at);
        }

        // Restore library
        const insLib = db.prepare("INSERT INTO prompt_library (id, project_id, category, title, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const l of data.library || []) {
          insLib.run(l.id, l.project_id, l.category, l.title, l.prompt, l.created_at);
        }

        // Restore palettes
        const insPal = db.prepare("INSERT INTO palettes (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const p of data.palettes || []) {
          insPal.run(p.id, p.project_id, p.name, p.image_data, p.created_at);
        }

        // Restore references
        const insRef = db.prepare("INSERT INTO references_images (id, project_id, name, image_data, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const r of data.references || []) {
          insRef.run(r.id, r.project_id, r.name, r.image_data, r.created_at);
        }

        // Restore showcase
        const insShow = db.prepare("INSERT INTO showcase (id, project_id, type, item_id, starred, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        for (const s of data.showcase || []) {
          insShow.run(s.id, s.project_id, s.type, s.item_id, s.starred, s.created_at);
        }

        // Restore styles
        const insStyle = db.prepare("INSERT INTO styles (id, project_id, name, style_json, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const s of data.styles || []) {
          insStyle.run(s.id, s.project_id, s.name, s.style_json, s.created_at);
        }

        // Restore comments
        const insComm = db.prepare("INSERT INTO comments (id, showcase_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)");
        for (const c of data.comments || []) {
          insComm.run(c.id, c.showcase_id, c.text, c.author, c.created_at);
        }
      });

      transaction(data);
      res.json({ success: true });
    } catch (error) {
      console.error("Import failed:", error);
      res.status(500).json({ error: "Import failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.post("/api/sync", async (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
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
      console.error("Sync to GCS failed:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.post("/api/restore", async (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const data = await loadFromGCS(req.session.user.id);
      if (!data) {
        return res.status(404).json({ error: "No backup found in GCS" });
      }
      
      const transaction = db.transaction((data) => {
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
      });

      transaction(data);
      res.json({ success: true });
    } catch (error) {
      console.error("Restore from GCS failed:", error);
      res.status(500).json({ error: "Restore failed" });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
