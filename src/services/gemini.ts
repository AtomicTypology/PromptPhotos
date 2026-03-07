import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
};

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

export const generateStructuredPrompt = async (
  idea: string, 
  projectContext?: { brief: string, global_style: string }, 
  parentPrompt?: StructuredPrompt,
  feedback?: string
): Promise<StructuredPrompt> => {
  const ai = getAI();
  let systemInstruction = projectContext 
    ? `You are a creative engineer for a project with the following brief: "${projectContext.brief}". 
       The global visual style for this project is: "${projectContext.global_style}". 
       All generated prompts must strictly adhere to this project identity while incorporating the specific user idea.`
    : "You are a creative engineer converting ideas into structured image prompts.";

  if (parentPrompt) {
    systemInstruction += `\nThis is a refinement of an existing prompt: ${JSON.stringify(parentPrompt)}.`;
    if (feedback) {
      systemInstruction += `\nApply the following feedback to the refinement: "${feedback}".`;
    }
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
          camera: {
            type: Type.OBJECT,
            properties: {
              lens: { type: Type.STRING },
              depth_of_field: { type: Type.STRING }
            }
          },
          composition: {
            type: Type.OBJECT,
            properties: {
              framing: { type: Type.STRING },
              angle: { type: Type.STRING }
            }
          },
          color_grading: { type: Type.STRING },
          aspect_ratio: { type: Type.STRING, enum: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
          negative_prompt: { type: Type.STRING }
        },
        required: ["prompt", "style", "lighting"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const generateImage = async (structuredPrompt: StructuredPrompt, referenceImages?: string[]): Promise<string> => {
  const ai = getAI();
  
  // Construct the text prompt from JSON
  const fullPrompt = `
    Subject: ${structuredPrompt.prompt}
    Style: ${structuredPrompt.style}
    Lighting: ${structuredPrompt.lighting}
    Camera: ${structuredPrompt.camera?.lens}, ${structuredPrompt.camera?.depth_of_field}
    Composition: ${structuredPrompt.composition?.framing}, ${structuredPrompt.composition?.angle}
    Color Grading: ${structuredPrompt.color_grading}
    Negative Prompt: ${structuredPrompt.negative_prompt}
  `.trim();

  const parts: any[] = [{ text: fullPrompt }];

  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach(img => {
      parts.push({
        inlineData: {
          data: img.split(',')[1],
          mimeType: "image/png"
        }
      });
    });
    parts.push({ text: "Use the provided images as visual references for style, composition, and mood." });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ parts }],
    config: {
      imageConfig: {
        aspectRatio: structuredPrompt.aspect_ratio || "1:1",
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
};

export const generateMoodboard = async (vibe: string): Promise<Moodboard> => {
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

  return JSON.parse(response.text || "{}");
};

export const critiqueImage = async (imageData: string, originalPrompt: StructuredPrompt): Promise<Critique> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          { inlineData: { data: imageData.split(',')[1], mimeType: "image/png" } },
          { text: `Analyze this generated image against its prompt: ${JSON.stringify(originalPrompt)}. Provide a critique and a refined prompt to improve it.` }
        ]
      }
    ],
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
              camera: {
                type: Type.OBJECT,
                properties: {
                  lens: { type: Type.STRING },
                  depth_of_field: { type: Type.STRING }
                }
              },
              composition: {
                type: Type.OBJECT,
                properties: {
                  framing: { type: Type.STRING },
                  angle: { type: Type.STRING }
                }
              },
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

  return JSON.parse(response.text || "{}");
};
