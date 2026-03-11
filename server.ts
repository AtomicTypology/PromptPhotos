import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index.js";
import { GoogleGenAI, Type } from "@google/genai";

function getUserId(req: express.Request): string | null {
  return (req.user as any)?.claims?.sub || null;
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("promptstudio.db");

// Supabase Client (if configured)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: any = null;
let supabaseAdmin: any = null;

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

if (supabase) {
  console.log("Supabase (Persistent Postgres) configured.");
  if (supabaseAdmin) {
    console.log("Supabase Admin (Service Role) configured for storage.");
  }
} else {
  console.log("Using local SQLite (Ephemeral). Add SUPABASE_URL and SUPABASE_ANON_KEY for persistence.");
}

// Google Cloud Configuration
const gcsBucketName = process.env.GCS_BUCKET_NAME;

const storage = gcsBucketName ? new Storage() : null;
const bucket = storage ? storage.bucket(gcsBucketName) : null;

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

// Add user_id and image_url columns to local DB for compatibility
const tables = ['generations', 'styles', 'palettes', 'references_images', 'showcase', 'prompt_library', 'project_settings'];
for (const table of tables) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`).run();
  } catch (e) {}
}
try {
  db.prepare("ALTER TABLE generations ADD COLUMN image_url TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE palettes ADD COLUMN image_url TEXT").run();
} catch (e) {}

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

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isGuestAllowed = req.method === 'GET' && !req.path.startsWith('/api/export');
  
  if (!getUserId(req) && !isGuestAllowed) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

async function uploadToSupabase(base64Data: string, bucketName: string, fileName: string) {
  if (!supabaseAdmin) return null;
  try {
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true
      });
    if (error) throw error;
    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);
    return publicUrl;
  } catch (error) {
    console.error("Supabase Storage upload failed:", error);
    return null;
  }
}

async function startServer() {
  try {
    const app = express();
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

    app.use(express.json({ limit: '50mb' }));

    await setupAuth(app);
    registerAuthRoutes(app);

    app.use(async (req: any, _res, next) => {
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims && supabase) {
        const claims = req.user.claims;
        const userId = claims.sub;
        if (userId && !req._supabaseUpsertDone) {
          req._supabaseUpsertDone = true;
          try {
            await supabase.from('users').upsert({
              id: userId,
              email: claims.email,
              name: [claims.first_name, claims.last_name].filter(Boolean).join(" ") || claims.email,
              picture: claims.profile_image_url
            });

            const { data: projects } = await supabase
              .from('project_settings')
              .select('id')
              .eq('user_id', userId)
              .limit(1);

            if (!projects || projects.length === 0) {
              await supabase.from('project_settings').insert({
                user_id: userId,
                name: 'Main Workspace',
                brief: 'Your primary creative environment.',
                global_style: 'Modern, Clean, Minimalist'
              });
            }
          } catch (err) {
            console.error("Supabase user upsert failed:", err);
          }
        }
      }
      next();
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
  app.get("/api/search", requireAuth, (req, res) => {
    const userId = getUserId(req);
    const query = `%${req.query.q || ''}%`;
    const results = {
      generations: db.prepare(`
        SELECT g.*, COALESCE(p.name, 'Unknown Project') as project_name 
        FROM generations g 
        LEFT JOIN project_settings p ON g.project_id = p.id 
        WHERE (g.idea LIKE ? OR g.prompt_json LIKE ?) AND g.user_id IS ?
      `).all(query, query, userId),
      library: db.prepare(`
        SELECT l.*, COALESCE(p.name, 'Unknown Project') as project_name 
        FROM prompt_library l 
        LEFT JOIN project_settings p ON l.project_id = p.id 
        WHERE (l.title LIKE ? OR l.prompt LIKE ?) AND l.user_id IS ?
      `).all(query, query, userId),
      projects: db.prepare("SELECT * FROM project_settings WHERE (name LIKE ? OR brief LIKE ?) AND user_id IS ?").all(query, query, userId)
    };
    res.json(results);
  });

  // Project Stats
  app.get("/api/projects/stats", requireAuth, async (req, res) => {
    const userId = getUserId(req);
    if (supabase && userId) {
      const { data: stats, error } = await supabase
        .from('project_settings')
        .select(`
          id,
          name,
          generations:generations(count),
          library:prompt_library(count),
          references:references_images(count)
        `)
        .eq('user_id', userId);
      
      if (error) return res.status(500).json({ error: error.message });
      
      // Format Supabase response to match SQLite
      const formattedStats = stats.map((s: any) => ({
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
        (SELECT COUNT(*) FROM generations WHERE project_id = p.id AND user_id IS ?) as generation_count,
        (SELECT COUNT(*) FROM prompt_library WHERE project_id = p.id AND user_id IS ?) as library_count,
        (SELECT COUNT(*) FROM references_images WHERE project_id = p.id AND user_id IS ?) as reference_count
      FROM project_settings p
      WHERE p.user_id IS ?
    `).all(userId, userId, userId, userId);
    res.json(stats);
  });

  // API Routes

  app.get("/api/generations", requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const projectId = parseInt(req.query.projectId as string) || 1;
    
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) return res.status(500).json({ error: error.message });
      // Map image_url to image_data for frontend
      const mapped = data.map((g: any) => ({
        ...g,
        image_data: g.image_url || g.image_data
      }));
      return res.json(mapped);
    }

    const rows = db.prepare("SELECT * FROM generations WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
    res.json(rows);
  });

  app.post("/api/generations", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references } = req.body;
      
      if (!image_data) {
        console.error("Missing image_data in generation request");
        return res.status(400).json({ error: "Missing image_data" });
      }

      let imageUrl = null;
      if (image_data.startsWith('data:image')) {
        const fileName = `${userId}/gen_${Date.now()}.png`;
        imageUrl = await uploadToSupabase(image_data, 'promptphotos', fileName);
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('generations')
          .insert([{
            user_id: userId,
            idea,
            prompt_json,
            image_url: imageUrl,
            image_data: imageUrl ? null : image_data,
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
        "INSERT INTO generations (user_id, idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(userId, idea, prompt_json, image_data, parent_id || null, project_id || 1, feedback || null, batch_id || null, selected_references || null);
      
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Failed to save generation:", error);
      res.status(500).json({ error: "Internal server error saving generation", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/styles", requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const projectId = parseInt(req.query.projectId as string) || 1;
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = db.prepare("SELECT * FROM styles WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
    res.json(rows);
  });

  app.post("/api/styles", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    const { name, style_json, project_id } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('styles')
        .insert([{ user_id: userId, name, style_json, project_id: project_id || 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare(
      "INSERT INTO styles (user_id, name, style_json, project_id) VALUES (?, ?, ?, ?)"
    ).run(userId, name, style_json, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  // Palettes
  app.get("/api/palettes", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase && userId) {
        const { data, error } = await supabase
          .from('palettes')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        const mapped = data.map((p: any) => ({
          ...p,
          image_data: p.image_url || p.image_data
        }));
        return res.json(mapped);
      }
      const rows = db.prepare("SELECT * FROM palettes WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching palettes:", error);
      res.status(500).json({ error: "Failed to fetch palettes" });
    }
  });

  app.post("/api/palettes", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { name, image_data, project_id } = req.body;
      
      let imageUrl = null;
      if (image_data && image_data.startsWith('data:image')) {
        const fileName = `${userId}/pal_${Date.now()}.png`;
        imageUrl = await uploadToSupabase(image_data, 'promptphotos', fileName);
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('palettes')
          .insert([{ 
            user_id: userId, 
            name, 
            image_url: imageUrl,
            image_data: imageUrl ? null : image_data, 
            project_id: project_id || 1 
          }])
          .select('id')
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO palettes (user_id, name, image_data, project_id) VALUES (?, ?, ?, ?)").run(userId, name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving palette:", error);
      res.status(500).json({ error: "Failed to save palette" });
    }
  });

  // References
  app.get("/api/references", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase && userId) {
        const { data, error } = await supabase
          .from('references_images')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM references_images WHERE project_id = ? AND user_id IS ? ORDER BY created_at DESC").all(projectId, userId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching references:", error);
      res.status(500).json({ error: "Failed to fetch references" });
    }
  });

  app.post("/api/references", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { name, image_data, project_id } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('references_images')
          .insert([{ user_id: userId, name, image_data, project_id: project_id || 1 }])
          .select('id')
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO references_images (user_id, name, image_data, project_id) VALUES (?, ?, ?, ?)").run(userId, name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving reference:", error);
      res.status(500).json({ error: "Failed to save reference" });
    }
  });

  // Showcase
  app.get("/api/showcase", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const projectId = parseInt(req.query.projectId as string) || 1;
      if (supabase && userId) {
        const { data: showcase, error } = await supabase
          .from('showcase')
          .select(`
            *,
            generations (image_data, image_url, idea),
            references_images (image_data, name),
            palettes (image_data, image_url, name)
          `)
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const formatted = showcase.map((s: any) => {
          let image_preview = null;
          let title = null;
          if (s.type === 'generation') {
            image_preview = s.generations?.image_url || s.generations?.image_data;
            title = s.generations?.idea;
          } else if (s.type === 'reference') {
            image_preview = s.references_images?.image_data;
            title = s.references_images?.name;
          } else if (s.type === 'palette') {
            image_preview = s.palettes?.image_url || s.palettes?.image_data;
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
        WHERE s.project_id = ? AND s.user_id IS ?
        ORDER BY s.created_at DESC
      `).all(projectId, userId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching showcase:", error);
      res.status(500).json({ error: "Failed to fetch showcase" });
    }
  });

  app.post("/api/showcase", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    const { type, item_id, project_id } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('showcase')
        .insert([{ user_id: userId, type, item_id, project_id: project_id || 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO showcase (user_id, type, item_id, project_id) VALUES (?, ?, ?, ?)").run(userId, type, item_id, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/showcase/:id/star", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    if (supabase) {
      // Get current state
      const { data: current } = await supabase.from('showcase').select('starred').eq('id', req.params.id).eq('user_id', userId).single();
      const { error } = await supabase
        .from('showcase')
        .update({ starred: !current?.starred })
        .eq('id', req.params.id)
        .eq('user_id', userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("UPDATE showcase SET starred = 1 - starred WHERE id = ? AND user_id = ?").run(req.params.id, userId);
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
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (supabase && userId) {
        const { data, error } = await supabase
          .from('project_settings')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return res.json(data);
      }
      const rows = db.prepare("SELECT * FROM project_settings WHERE user_id IS ? ORDER BY updated_at DESC").all(userId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (supabase && userId) {
        const { data, error } = await supabase
          .from('project_settings')
          .select('*')
          .eq('id', req.params.id)
          .eq('user_id', userId)
          .single();
        if (error) throw error;
        return res.json(data);
      }
      const row = db.prepare("SELECT * FROM project_settings WHERE id = ? AND user_id IS ?").get(req.params.id, userId);
      res.json(row || null);
    } catch (error) {
      console.error("Error fetching project settings:", error);
      res.status(500).json({ error: "Failed to fetch project settings" });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { data, error } = await supabase
          .from('project_settings')
          .insert([{ user_id: userId, name: name || 'New Project', brief: brief || '', global_style: global_style || '' }])
          .select('id')
          .single();
        if (error) throw error;
        return res.json({ id: data.id });
      }
      const info = db.prepare("INSERT INTO project_settings (user_id, name, brief, global_style) VALUES (?, ?, ?, ?)")
        .run(userId, name || 'New Project', brief || '', global_style || '');
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { name, brief, global_style } = req.body;
      if (supabase) {
        const { error } = await supabase
          .from('project_settings')
          .update({ name, brief, global_style, updated_at: new Date().toISOString() })
          .eq('id', req.params.id)
          .eq('user_id', userId);
        if (error) throw error;
        return res.json({ success: true });
      }
      db.prepare("UPDATE project_settings SET name = ?, brief = ?, global_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .run(name, brief, global_style, req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating project settings:", error);
      res.status(500).json({ error: "Failed to update project settings" });
    }
  });

  app.delete("/api/generations/:id", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    if (supabase) {
      const { error } = await supabase.from('generations').delete().eq('id', req.params.id).eq('user_id', userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM generations WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ success: true });
  });

  // Prompt Library
  app.get("/api/library", requireAuth, async (req, res) => {
    const userId = getUserId(req);
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('prompt_library')
        .select('*')
        .eq('user_id', userId)
        .order('category', { ascending: true })
        .order('title', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const rows = db.prepare("SELECT * FROM prompt_library WHERE user_id IS ? ORDER BY category ASC, title ASC").all(userId);
    res.json(rows);
  });

  app.post("/api/library", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    const { category, title, prompt } = req.body;
    if (supabase) {
      const { data, error } = await supabase
        .from('prompt_library')
        .insert([{ user_id: userId, category, title, prompt, project_id: 1 }])
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ id: data.id });
    }
    const info = db.prepare("INSERT INTO prompt_library (user_id, category, title, prompt, project_id) VALUES (?, ?, ?, ?, 1)")
      .run(userId, category, title, prompt);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/library/import", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    const { items } = req.body;
    
    if (supabase) {
      const { error } = await supabase.from('prompt_library').insert(
        items.map((item: any) => ({
          user_id: userId,
          category: item.category,
          title: item.title,
          prompt: item.prompt,
          project_id: 1
        }))
      );
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    const insert = db.prepare("INSERT INTO prompt_library (user_id, category, title, prompt, project_id) VALUES (?, ?, ?, ?, 1)");
    const transaction = db.transaction((items) => {
      for (const item of items) {
        insert.run(userId, item.category, item.title, item.prompt);
      }
    });
    transaction(items);
    res.json({ success: true });
  });

  app.delete("/api/library/:id", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
    if (supabase) {
      const { error } = await supabase.from('prompt_library').delete().eq('id', req.params.id).eq('user_id', userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    db.prepare("DELETE FROM prompt_library WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ success: true });
  });

  // Privacy: Purge Server Database
  app.post("/api/purge", requireAuth, (req, res) => {
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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

  app.post("/api/sync", requireAuth, async (req, res) => {
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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

  // ─── Gemini AI Routes ───────────────────────────────────────────────────────

  const getAI = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    return new GoogleGenAI({ apiKey });
  };

  app.post("/api/ai/generate-prompt", async (req, res) => {
    try {
      const { idea, projectContext, parentPrompt, feedback } = req.body;
      const ai = getAI();

      let systemInstruction = projectContext
        ? `You are a creative engineer for a project with the following brief: "${projectContext.brief}". The global visual style is: "${projectContext.global_style}". All prompts must adhere to this project identity.`
        : "You are a creative engineer converting ideas into structured image prompts.";

      if (parentPrompt) {
        systemInstruction += `\nThis is a refinement of: ${JSON.stringify(parentPrompt)}.`;
        if (feedback) systemInstruction += `\nApply this feedback: "${feedback}".`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Convert this image idea into a structured JSON prompt: "${idea}".`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING },
              style: { type: Type.STRING },
              lighting: { type: Type.STRING },
              camera: { type: Type.OBJECT, properties: { lens: { type: Type.STRING }, depth_of_field: { type: Type.STRING } } },
              composition: { type: Type.OBJECT, properties: { framing: { type: Type.STRING }, angle: { type: Type.STRING } } },
              color_grading: { type: Type.STRING },
              aspect_ratio: { type: Type.STRING, enum: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
              negative_prompt: { type: Type.STRING }
            },
            required: ["prompt", "style", "lighting"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (err: any) {
      console.error("generate-prompt error:", err);
      res.status(500).json({ error: err.message || "Failed to generate prompt" });
    }
  });

  app.post("/api/ai/generate-image", async (req, res) => {
    try {
      const { structuredPrompt, referenceImages } = req.body;
      const ai = getAI();

      const fullPrompt = [
        `Subject: ${structuredPrompt.prompt}`,
        `Style: ${structuredPrompt.style}`,
        `Lighting: ${structuredPrompt.lighting}`,
        structuredPrompt.camera?.lens ? `Camera: ${structuredPrompt.camera.lens}, ${structuredPrompt.camera.depth_of_field}` : "",
        structuredPrompt.composition?.framing ? `Composition: ${structuredPrompt.composition.framing}, ${structuredPrompt.composition.angle}` : "",
        structuredPrompt.color_grading ? `Color Grading: ${structuredPrompt.color_grading}` : "",
        structuredPrompt.negative_prompt ? `Negative Prompt: ${structuredPrompt.negative_prompt}` : ""
      ].filter(Boolean).join("\n");

      const parts: any[] = [{ text: fullPrompt }];

      if (referenceImages?.length) {
        referenceImages.forEach((img: string) => {
          parts.push({ inlineData: { data: img.split(",")[1], mimeType: "image/png" } });
        });
        parts.push({ text: "Use the provided images as visual references for style, composition, and mood." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: structuredPrompt.aspect_ratio || "1:1",
            imageSize: "1K"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return res.json({ image: `data:image/png;base64,${part.inlineData.data}` });
        }
      }

      res.status(500).json({ error: "No image generated" });
    } catch (err: any) {
      console.error("generate-image error:", err);
      res.status(500).json({ error: err.message || "Failed to generate image" });
    }
  });

  app.post("/api/ai/generate-moodboard", async (req, res) => {
    try {
      const { vibe } = req.body;
      const ai = getAI();

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate a moodboard for the vibe: "${vibe}".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              palette: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  colors: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["name", "colors"]
              },
              visual_language: { type: Type.STRING },
              reference_prompts: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["palette", "visual_language", "reference_prompts"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (err: any) {
      console.error("generate-moodboard error:", err);
      res.status(500).json({ error: err.message || "Failed to generate moodboard" });
    }
  });

  app.post("/api/ai/critique", async (req, res) => {
    try {
      const { imageData, originalPrompt } = req.body;
      const ai = getAI();

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{
          parts: [
            { inlineData: { data: imageData.split(",")[1], mimeType: "image/png" } },
            { text: `Analyze this generated image against its prompt: ${JSON.stringify(originalPrompt)}. Provide a critique and a refined prompt to improve it.` }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              refined_prompt: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  style: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  camera: { type: Type.OBJECT, properties: { lens: { type: Type.STRING }, depth_of_field: { type: Type.STRING } } },
                  composition: { type: Type.OBJECT, properties: { framing: { type: Type.STRING }, angle: { type: Type.STRING } } },
                  color_grading: { type: Type.STRING },
                  aspect_ratio: { type: Type.STRING, enum: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
                  negative_prompt: { type: Type.STRING }
                },
                required: ["prompt", "style", "lighting"]
              }
            },
            required: ["analysis", "suggestions", "refined_prompt"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (err: any) {
      console.error("critique error:", err);
      res.status(500).json({ error: err.message || "Failed to critique image" });
    }
  });

  // ─── End Gemini AI Routes ────────────────────────────────────────────────────

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
