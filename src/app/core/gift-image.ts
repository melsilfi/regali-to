export interface GiftPhoto {
  src: string;
  example: boolean;
}

export function exampleGiftImage(): string {
  return '/logo-gift.png';
}

export function displayGiftImage(gift: { imageUrl: string | null }): GiftPhoto {
  if (gift.imageUrl) {
    return { src: gift.imageUrl, example: false };
  }
  return { src: exampleGiftImage(), example: false };
}
