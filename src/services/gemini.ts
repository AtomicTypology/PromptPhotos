export interface StructuredPrompt {
  prompt: string;
  style: string;
  lighting: string;
  camera?: {
    lens?: string;
    depth_of_field?: string;
  };
  composition?: {
    framing?: string;
    angle?: string;
  };
  color_grading?: string;
  aspect_ratio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  negative_prompt?: string;
}

export interface Moodboard {
  palette: { name: string; colors: string[] };
  visual_language: string;
  reference_prompts: string[];
}

export interface Critique {
  analysis: string;
  suggestions: string[];
  refined_prompt: StructuredPrompt;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(err.error || `Request failed: ${res.status}`) as any;
    error.quota_exhausted = err.quota_exhausted;
    error.needs_upgrade = err.needs_upgrade;
    throw error;
  }
  return res.json();
}

export const generateStructuredPrompt = async (
  idea: string,
  projectContext?: { brief: string; global_style: string },
  parentPrompt?: StructuredPrompt,
  feedback?: string
): Promise<StructuredPrompt> => {
  return post("/api/ai/generate-prompt", { idea, projectContext, parentPrompt, feedback });
};

export const generateImage = async (
  structuredPrompt: StructuredPrompt,
  referenceImages?: string[]
): Promise<string> => {
  const data = await post<{ image: string }>("/api/ai/generate-image", {
    structuredPrompt,
    referenceImages,
  });
  return data.image;
};

export const generateMoodboard = async (vibe: string): Promise<Moodboard> => {
  return post("/api/ai/generate-moodboard", { vibe });
};

export const critiqueImage = async (
  imageData: string,
  originalPrompt: StructuredPrompt
): Promise<Critique> => {
  return post("/api/ai/critique", { imageData, originalPrompt });
};
