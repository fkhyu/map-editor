import { Feature, Polygon } from 'geojson';
import transformRotate from '@turf/transform-rotate';

export const debounce = (fn: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

export const rotateFeature = (
  feature: Feature<Polygon>,
  angle: number,
  pivot: [number, number]
): Feature<Polygon> => {
  return transformRotate(feature, angle, { pivot });
};

export function capitalise(word: string) {
    if (!word) return word;
    return word[0].toUpperCase() + word.substr(1).toLowerCase();
}

export function generateUniqueId(): string {
  return crypto.randomUUID();
}