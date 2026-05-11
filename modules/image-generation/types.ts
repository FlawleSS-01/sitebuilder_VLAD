/**
 * Типы размеров изображений
 */
export type ImageSizeOption =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "1536x512"
  | "1280x704"
  | "512x512";

export const parseImageSize = (
  value: string | undefined,
  fallback: ImageSizeOption
): ImageSizeOption => {
  if (
    value === "1024x1024" ||
    value === "1792x1024" ||
    value === "1024x1792" ||
    value === "1536x512" ||
    value === "1280x704" ||
    value === "512x512"
  ) {
    return value;
  }
  return fallback;
};

