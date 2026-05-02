import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface OutfitRecommendation {
  type: "Casual" | "Business" | "Night Out";
  description: string;
  pieces: string[];
  visualPrompt: string;
  image?: string;
  modelImage?: string;
}

export interface AnalysisResult {
  colorPalette: string[];
  styleTags: string[];
  itemDescription: string;
  outfits: OutfitRecommendation[];
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number = 3, delay: number = 2000): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message?.toLowerCase() || "";
      
      // If we still have attempts left, retry most errors
      if (i < attempts - 1) {
        // Handle specific "QUOTA_EXCEEDED" logic for the final throw, 
        // but retry all intermittent issues including "Failed to generate"
        const isQuota = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit");
        
        // Exponential backoff with jitter
        const jitter = Math.random() * 1000;
        const waitTime = (delay * Math.pow(2, i)) + jitter;
        
        console.warn(`Attempt ${i + 1} failed: ${msg}. Retrying in ${Math.round(waitTime)}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Final attempt failed
      if (msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit")) {
        throw new Error("QUOTA_EXCEEDED");
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function analyzeItem(base64Image: string, mimeType: string): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Perform a comprehensive "Full Appearance & Style Analysis" on the person in this image. 

  1. Analyze:
     - Body type and silhouette.
     - Facial features and skin tone.
     - Current outfit style and color palette (identify hex codes).

  2. Goals:
     - Suggest 3 distinct outfit types: Casual, Business/Formal, and Night Out.
     - CRITICAL: Each suggestion MUST use a color palette that is significantly DIFFERENT from the person's current outfit.
     - Avoid repeating the primary colors the user is currently wearing.
     - Select colors and patterns that complement the user's natural features (skin tone/hair) but provide a fresh visual change.

  3. Output:
     - Identification of current palette (hex codes).
     - Style tags describing the user's natural aesthetic.
     - A summary of the analysis (body type and features).
     - Detailed recommendations for each outfit type, including a 'flat-lay' image generation prompt that describes the specific pieces, colors, and textures in a coordinated layout.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
            styleTags: { type: Type.ARRAY, items: { type: Type.STRING } },
            itemDescription: { type: Type.STRING },
            outfits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["Casual", "Business", "Night Out"] },
                  description: { type: Type.STRING },
                  pieces: { type: Type.ARRAY, items: { type: Type.STRING } },
                  visualPrompt: { type: Type.STRING }
                },
                required: ["type", "description", "pieces", "visualPrompt"]
              }
            }
          },
          required: ["colorPalette", "styleTags", "itemDescription", "outfits"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as AnalysisResult;
  }, 4, 3000);
}

export async function generateOutfitImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: `A professional fashion flat-lay photo of: ${prompt}. 
            The ensemble should be curated for the person in the reference photo, but features entirely new pieces as described in the prompt.
            Clean white background, high-end photography, cinematic lighting, organized layout, isolated on white.` }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("Failed to generate image");
  }, 5, 5000); // Increased attempts and base delay
}

export async function generateModelImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: `A high-end fashion editorial full-body photo. 
            STRICT REQUIREMENT: Maintain the EXACT facial features, skin tone, and likeness of the person in the provided image. 
            The person should be wearing: ${prompt}. 
            Setting: Urban chic background, studio lighting, professional model posing, cinematic street photography style, high-end magazine aesthetic.` }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("Failed to generate model image");
  }, 6, 6000); // More aggressive retries for the model view as it's more resource intensive
}
