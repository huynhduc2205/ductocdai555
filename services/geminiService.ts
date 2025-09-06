import { GoogleGenAI, Modality } from "@google/genai";

// Ensure the API key is available in the environment variables.
if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Edits an image using the Gemini API based on a base image and a text prompt.
 * @param images An array of objects, each containing the base64 encoded string and MIME type of an image.
 * @param prompt The text description of the edits to perform.
 * @returns A promise that resolves to the base64 data URL of the edited image.
 */
export const editImage = async (images: { base64ImageData: string; mimeType: string }[], prompt: string): Promise<string> => {
  try {
    const imageParts = images.map(image => ({
      inlineData: {
        data: image.base64ImageData,
        mimeType: image.mimeType,
      },
    }));

    // Globally enforce the output format and quality for every API call to ensure best results.
    const fullPrompt = `${prompt} Generate the output as a PNG file with the highest possible resolution and no compression.`;

    const parts = [...imageParts, { text: fullPrompt }];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts },
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          // The model returns the edited image.
          const editedImageMimeType = part.inlineData.mimeType;
          const editedImageBase64 = part.inlineData.data;
          return `data:${editedImageMimeType};base64,${editedImageBase64}`;
        }
    }
    
    // This case handles when the API returns a response but no image data.
    throw new Error("API response did not contain image data.");

  } catch (error) {
    console.error("Error editing image with Gemini API:", error);
    if (error instanceof Error) {
        // Re-throw a more specific error message.
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unexpected error occurred while communicating with the Gemini API.");
  }
};