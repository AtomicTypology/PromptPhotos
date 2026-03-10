-- PromptPhotos — Supabase Schema (user-scoped, with Storage for images)
-- Run this in your Supabase SQL Editor
--
-- BEFORE running this SQL:
--   1. Go to Storage > New Bucket
--   2. Name: "promptphotos"  |  Public bucket: ON
--   3. Then run this script

-- 0. Users Table (auto-populated on first Google login)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,   -- Google OAuth sub
    email TEXT,
    name TEXT,
    picture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. Project Settings Table
CREATE TABLE IF NOT EXISTS project_settings (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT,
    brief TEXT,
    global_style TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_settings_user ON project_settings(user_id);

-- 2. Generations Table
--    image_url = Supabase Storage public URL (used when storage is configured)
--    image_data = base64 fallback (kept for backwards compat)
CREATE TABLE IF NOT EXISTS generations (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    idea TEXT,
    prompt_json TEXT,
    image_data TEXT,
    image_url TEXT,
    parent_id BIGINT,
    feedback TEXT,
    batch_id TEXT,
    selected_references TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id);

-- 3. Styles Table
CREATE TABLE IF NOT EXISTS styles (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    name TEXT,
    style_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_styles_user ON styles(user_id);

-- 4. Palettes Table
CREATE TABLE IF NOT EXISTS palettes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    name TEXT,
    image_data TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_palettes_user ON palettes(user_id);

-- 5. References Table
--    References keep base64 in image_data — passed inline to Gemini for generation
CREATE TABLE IF NOT EXISTS references_images (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    name TEXT,
    image_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_references_user ON references_images(user_id);

-- 6. Showcase Table
CREATE TABLE IF NOT EXISTS showcase (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    type TEXT,  -- 'generation', 'palette', 'reference'
    item_id BIGINT,
    starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_showcase_user ON showcase(user_id);

-- 7. Comments Table (scoped via showcase ownership)
CREATE TABLE IF NOT EXISTS comments (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    showcase_id BIGINT REFERENCES showcase(id) ON DELETE CASCADE,
    text TEXT,
    author TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Prompt Library Table
CREATE TABLE IF NOT EXISTS prompt_library (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE SET NULL,
    category TEXT,
    title TEXT,
    prompt TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prompt_library_user ON prompt_library(user_id);

-- Row Level Security
-- The server always uses the service role key which bypasses RLS.
-- These policies block any direct anon/client requests as a safety net.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE palettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE references_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "block_direct_access" ON users AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON project_settings AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON generations AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON styles AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON palettes AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON references_images AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON showcase AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON comments AS RESTRICTIVE USING (false);
CREATE POLICY "block_direct_access" ON prompt_library AS RESTRICTIVE USING (false);

-- Storage bucket policy (run after creating "promptphotos" public bucket):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('promptphotos', 'promptphotos', true)
-- ON CONFLICT (id) DO NOTHING;
