import {
  DEFAULT_DRONE_CARD_IMAGE_PATH,
  DEFAULT_DRONE_MARKER_IMAGE_PATH,
} from "../constants";

export function getImageUrlOrFallback(
  imageUrl: string | null | undefined,
  fallbackUrl: string,
) {
  return imageUrl?.trim() ? imageUrl : fallbackUrl;
}

export function getMapMarkerImageUrl(imageUrl: string | null | undefined) {
  return getImageUrlOrFallback(imageUrl, DEFAULT_DRONE_MARKER_IMAGE_PATH);
}

export function getCardImageUrl(imageUrl: string | null | undefined) {
  return getImageUrlOrFallback(imageUrl, DEFAULT_DRONE_CARD_IMAGE_PATH);
}
