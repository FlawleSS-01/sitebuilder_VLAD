/**
 * Validates and parses JSON string
 * Enhances parsed JSON with image/button injection
 */
export const validateAndParseJSON = (
  jsonString: string,
  imgBase?: string,
  buttonText?: string
): any => {
  if (!jsonString || typeof jsonString !== "string") {
    return null;
  }

  let cleaned = jsonString.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
    cleaned = cleaned.trim();
  }

  // Find JSON object boundaries
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Basic validation
    const requiredKeys = [
      "title",
      "description",
      "h1",
      "h1Description",
      "blocks",
    ];
    const hasRequiredKeys = requiredKeys.every((key) => key in parsed);

    if (!hasRequiredKeys) {
      console.warn(
        "JSON missing some required keys:",
        requiredKeys.filter((key) => !(key in parsed))
      );
    }

    // Add h1Image
    if (typeof imgBase === "string") {
      parsed.h1Image = imgBase;
    }

    // Add image to first block
    if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
      const firstBlock = parsed.blocks[0];
      if (Array.isArray(firstBlock.elements)) {
        firstBlock.elements.push({
          type: "image",
          src: imgBase + "1",
        });
      }
    }

    // Add image + button to last block
    if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
      const lastBlock = parsed.blocks[parsed.blocks.length - 1];
      if (Array.isArray(lastBlock.elements)) {
        lastBlock.elements.push(
          {
            type: "image",
            src: imgBase + "2",
          },
          {
            type: "button",
            text: buttonText || "",
          }
        );
      }
    }

    return parsed;
  } catch (error: any) {
    console.error("JSON parsing error:", error.message);
    console.error("Attempted to parse:", cleaned.substring(0, 200));
    return null;
  }
};
