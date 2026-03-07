export interface Preset {
  category: string;
  subcategory: string;
  prompt: string;
}

export const PRESETS: Preset[] = [
  // Headshots
  { category: "Headshot", subcategory: "Editorial", prompt: "Photorealistic headshot of a confident woman looking directly at camera, natural skin texture, soft cinematic lighting, subtle film grain, high-end editorial portrait style, shallow depth of field" },
  { category: "Headshot", subcategory: "Editorial", prompt: "Professional headshot with relaxed expression, neutral background, soft studio lighting, natural skin texture, high dynamic range portrait clarity" },
  { category: "Headshot", subcategory: "Editorial", prompt: "High-end magazine portrait inspired by Annie Leibovitz lighting, painterly light, rich textures, dramatic but soft shadows" },
  { category: "Headshot", subcategory: "Film Portrait", prompt: "Portrait shot on 35mm film, subtle film grain, warm sunlight, Kodachrome colors, natural expression" },
  { category: "Headshot", subcategory: "Film Portrait", prompt: "Dreamy retro portrait inspired by Petra Collins, pastel tones, hazy glow, soft focus, nostalgic lighting" },
  { category: "Headshot", subcategory: "Street Portrait", prompt: "Urban portrait inspired by Garry Winogrand, candid expression, natural street light, energetic background" },
  { category: "Headshot", subcategory: "Studio Portrait", prompt: "Clean studio portrait with directional lighting sculpting the face, soft shadows, modern editorial look" },
  { category: "Headshot", subcategory: "Creative Portrait", prompt: "Artistic portrait with bold color background, vibrant lighting accents, stylized editorial photography" },
  { category: "Headshot", subcategory: "Professional", prompt: "Corporate headshot, modern office background, confident expression, natural light" },
  
  // Art Creation
  { category: "Art Creation", subcategory: "Abstract Painting", prompt: "Abstract expressive painting with luminous colors layered over textured background, bold brush strokes and energetic movement" },
  { category: "Art Creation", subcategory: "Abstract Painting", prompt: "Contemporary abstract artwork with unexpected color combinations, acrylic mixed media layers, markings and splashes" },
  { category: "Art Creation", subcategory: "Floral Abstract", prompt: "Abstract expressive florals with bold hand drawn outlines, layered backgrounds, bright luminous colors and playful organic shapes" },
  { category: "Art Creation", subcategory: "Landscape Abstract", prompt: "Abstract landscape painting with unlikely color combinations and layered textures" },
  { category: "Art Creation", subcategory: "Pattern Art", prompt: "Bright stylized pattern design with floral shapes and bold outlines" },

  // Branding & Logo (Placeholders as requested)
  { category: "Branding", subcategory: "Minimalist", prompt: "Minimalist brand identity mockup, clean sans-serif typography, neutral color palette, high-end stationery design, soft shadows, professional presentation" },
  { category: "Branding", subcategory: "Luxury", prompt: "Luxury brand identity, gold foil accents on matte black paper, elegant serif typography, premium texture, sophisticated lighting" },
  { category: "Logo", subcategory: "Modern", prompt: "Modern vector logo design, geometric shapes, clean lines, flat design, vibrant gradient, white background, high resolution" },
  { category: "Logo", subcategory: "Vintage", prompt: "Vintage hand-drawn logo, rustic typography, textured ink effect, classic emblem style, heritage feel" }
];
