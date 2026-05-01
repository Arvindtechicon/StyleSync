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

export async function analyzeItem(base64Image: string, mimeType: string, customOutfit?: { data: string, mime: string }): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = customOutfit 
    ? `Perform a "Custom Virtual Try-on Analysis".
       1. Analyze the person in the first image (Body type, features).
       2. Analyze the specific clothing item/outfit in the second image.
       3. Suggest how this specific outfit should be styled for this person.
       4. Return "outfits" array with a single entry of type "Business" (repurposed for custom) specifically detailing how to wear this item.
       
       OUTPUT: Return the analysis of both inputs. In the 'visualPrompt' for the outfit, provide instructions to place the EXACT clothing from image 2 onto the person from image 1.`
    : `Perform a comprehensive "Full Appearance & Style Analysis" on the person in this image. 

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

  const contents = {
    parts: [
      { inlineData: { data: base64Image, mimeType } },
      ...(customOutfit ? [{ inlineData: { data: customOutfit.data, mimeType: customOutfit.mime } }] : []),
      { text: prompt }
    ]
  };

  const response = await ai.models.generateContent({
    model,
    contents,
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
}

export async function generateOutfitImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  try {
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

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "SAFETY") {
      throw new Error("IMAGE_SAFETY_BLOCKED");
    }
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw error;
  }

  throw new Error("Failed to generate image");
}

export async function generateModelImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  try {
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
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw error;
  }

  throw new Error("Failed to generate model image");
}
