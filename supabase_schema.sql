-- Run this in your Supabase SQL Editor to set up your persistent database

-- 0. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    picture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. Generations Table
CREATE TABLE IF NOT EXISTS generations (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
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

-- 2. Styles Table
CREATE TABLE IF NOT EXISTS styles (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    style_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Palettes Table
CREATE TABLE IF NOT EXISTS palettes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    image_data TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. References Table
CREATE TABLE IF NOT EXISTS references_images (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    image_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Showcase Table
CREATE TABLE IF NOT EXISTS showcase (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    type TEXT, -- 'generation', 'palette', 'reference'
    item_id BIGINT,
    starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    showcase_id BIGINT,
    text TEXT,
    author TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Project Settings Table
CREATE TABLE IF NOT EXISTS project_settings (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    name TEXT,
    brief TEXT,
    global_style TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Prompt Library Table
CREATE TABLE IF NOT EXISTS prompt_library (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    category TEXT,
    title TEXT,
    prompt TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
