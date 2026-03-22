export interface Generation {
  id: number;
  project_id: number;
  idea: string;
  prompt_json: string;
  image_data: string;
  parent_id?: number | null;
  feedback?: string | null;
  batch_id?: string | null;
  selected_references?: string | null; // JSON array of reference IDs
  created_at: string;
}

export interface PromptLibraryItem {
  id: number;
  project_id: number;
  category: string;
  title: string;
  prompt: string;
  created_at: string;
}

export interface StyleTemplate {
  id: number;
  project_id: number;
  name: string;
  style_json: string;
  created_at: string;
}

export interface Palette {
  id: number;
  project_id: number;
  name: string;
  image_data: string;
  created_at: string;
}

export interface ReferenceImage {
  id: number;
  project_id: number;
  name: string;
  image_data: string;
  created_at: string;
}

export interface ShowcaseItem {
  id: number;
  type: 'generation' | 'palette' | 'reference';
  item_id: number;
  starred: number;
  image_preview?: string;
  title: string;
  created_at: string;
}

export interface Comment {
  id: number;
  showcase_id: number;
  text: string;
  author: string;
  created_at: string;
}

export interface ProjectSettings {
  id: number;
  name: string;
  brief: string;
  global_style: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface ClientShare {
  id: number;
  user_id: string;
  project_id: number;
  token: string;
  label: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface SystemHealth {
  sqlite: boolean;
  supabase: boolean;
  supabaseMode: 'service_role' | 'anon_key' | null;
  supabaseError?: string;
  gcs: boolean;
  timestamp: string;
}

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorData;
    try {
      errorData = JSON.parse(text);
    } catch (e) {
      errorData = { error: text || `Request failed with status ${res.status}` };
    }

    // If it's a 401, we want to make sure the user knows they need to log in
    if (res.status === 401) {
      throw new Error(errorData.details || "Unauthorized: Please sign in to continue.");
    }

    throw new Error(errorData.details || errorData.error || `Request failed with status ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

export const api = {
  getProjects: async (): Promise<ProjectSettings[]> => {
    const res = await fetch("/api/projects");
    return handleResponse(res);
  },
  getProject: async (id: number): Promise<ProjectSettings> => {
    const res = await fetch(`/api/projects/${id}`);
    return handleResponse(res);
  },
  createProject: async (data: { name: string; brief: string; global_style: string }): Promise<{ id: number }> => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  updateProject: async (id: number, data: { name: string; brief: string; global_style: string }): Promise<void> => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await handleResponse(res);
  },
  getGenerations: async (projectId: number): Promise<Generation[]> => {
    const res = await fetch(`/api/generations?projectId=${projectId}`);
    return handleResponse(res);
  },
  saveGeneration: async (data: Omit<Generation, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  deleteGeneration: async (id: number): Promise<void> => {
    const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
    await handleResponse(res);
  },
  getStyles: async (projectId: number): Promise<StyleTemplate[]> => {
    const res = await fetch(`/api/styles?projectId=${projectId}`);
    return handleResponse(res);
  },
  saveStyle: async (data: Omit<StyleTemplate, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  // New Endpoints
  getPalettes: async (projectId: number): Promise<Palette[]> => {
    const res = await fetch(`/api/palettes?projectId=${projectId}`);
    return handleResponse(res);
  },
  savePalette: async (data: { name: string; image_data: string; project_id?: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/palettes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  getReferences: async (projectId: number): Promise<ReferenceImage[]> => {
    const res = await fetch(`/api/references?projectId=${projectId}`);
    return handleResponse(res);
  },
  saveReference: async (data: { name: string; image_data: string; project_id?: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  getShowcase: async (projectId: number): Promise<ShowcaseItem[]> => {
    const res = await fetch(`/api/showcase?projectId=${projectId}`);
    return handleResponse(res);
  },
  addToShowcase: async (data: { type: string; item_id: number; project_id: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  toggleStar: async (id: number): Promise<void> => {
    const res = await fetch(`/api/showcase/${id}/star`, { method: "POST" });
    await handleResponse(res);
  },
  getComments: async (id: number): Promise<Comment[]> => {
    const res = await fetch(`/api/showcase/${id}/comments`);
    return handleResponse(res);
  },
  addComment: async (id: number, data: { text: string; author: string }): Promise<{ id: number }> => {
    const res = await fetch(`/api/showcase/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  // Prompt Library
  getLibrary: async (): Promise<PromptLibraryItem[]> => {
    const res = await fetch("/api/library");
    return handleResponse(res);
  },
  saveLibraryItem: async (data: Omit<PromptLibraryItem, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  importLibrary: async (items: Omit<PromptLibraryItem, "id" | "created_at">[]): Promise<void> => {
    const res = await fetch("/api/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    await handleResponse(res);
  },
  deleteLibraryItem: async (id: number): Promise<void> => {
    const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
    await handleResponse(res);
  },
  globalSearch: async (query: string): Promise<{ generations: any[]; library: any[]; projects: any[] }> => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return handleResponse(res);
  },
  getProjectStats: async (): Promise<any[]> => {
    const res = await fetch("/api/projects/stats");
    return handleResponse(res);
  },
  rescueData: async (): Promise<any> => {
    const res = await fetch("/api/rescue");
    return handleResponse(res);
  },
  exportWorkspace: async (): Promise<any> => {
    const res = await fetch("/api/export");
    return handleResponse(res);
  },
  importWorkspace: async (data: any): Promise<void> => {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await handleResponse(res);
  },
  purgeServer: async (): Promise<void> => {
    const res = await fetch("/api/purge", { method: "POST" });
    await handleResponse(res);
  },
  getAuthUrl: async (): Promise<{ url: string }> => {
    const res = await fetch("/api/auth/url");
    return handleResponse(res);
  },
  getMe: async (): Promise<AuthUser | null> => {
    const res = await fetch("/api/me");
    return handleResponse(res);
  },
  logout: async (): Promise<void> => {
    const res = await fetch("/api/logout", { method: "POST" });
    await handleResponse(res);
  },
  syncToGCS: async (): Promise<void> => {
    const res = await fetch("/api/sync", { method: "POST" });
    await handleResponse(res);
  },
  restoreFromGCS: async (): Promise<void> => {
    const res = await fetch("/api/restore", { method: "POST" });
    await handleResponse(res);
  },
  getHealth: async (): Promise<SystemHealth> => {
    const res = await fetch("/api/health");
    return handleResponse(res);
  },
  // Agency: client shares
  getShares: async (): Promise<ClientShare[]> => {
    const res = await fetch("/api/shares");
    return handleResponse(res);
  },
  createShare: async (data: { project_id: number; label?: string; expires_in_days?: number }): Promise<{ id: number; token: string }> => {
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  deleteShare: async (id: number): Promise<void> => {
    const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
    await handleResponse(res);
  },
};
