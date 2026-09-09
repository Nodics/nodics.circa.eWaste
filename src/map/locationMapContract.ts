/** Location Map v1 contract. All policy, labels, colors and defaults come from Location. */
export interface MapCategory {
  readonly code: string;
  readonly label: string;
  readonly color: string;
  readonly matchTerms: readonly string[];
}
export interface MapPresentation {
  readonly defaultCategoryCode: string;
  readonly categories: readonly MapCategory[];
}
export interface MapInteraction {
  readonly wheelZoomMode: 'MODIFIER' | 'FREE' | 'DISABLED';
  readonly wheelStep: number;
  readonly wheelCooldownMs: number;
  readonly zoomAnimationSeconds: number;
}
export interface MapFeatureCategoryInput {
  readonly name?: string | { readonly en?: string };
  readonly collectionPointType?: string;
  readonly serviceCapabilities?: readonly string[];
}
/** Matches the declarative categories in priority order; the designated default is last. */
export function categoryForFeature(feature: MapFeatureCategoryInput, presentation?: MapPresentation): MapCategory | undefined {
  if (!presentation) return undefined;
  const label = typeof feature.name === 'string' ? feature.name : feature.name?.en;
  const terms = [feature.collectionPointType, ...(feature.serviceCapabilities || []), label].filter(Boolean).join(' ').toLowerCase();
  return presentation.categories.find(category => category.code !== presentation.defaultCategoryCode && category.matchTerms.some(term => terms.includes(term.toLowerCase())))
    || presentation.categories.find(category => category.code === presentation.defaultCategoryCode);
}
/** Applies the same modifier rule to both renderer families without intercepting ordinary page scroll. */
export function shouldHandleMapWheel(event: Pick<WheelEvent, 'metaKey' | 'ctrlKey' | 'deltaY'>, interaction: MapInteraction, platform: string): boolean {
  if (!event.deltaY || interaction.wheelZoomMode === 'DISABLED') return false;
  if (interaction.wheelZoomMode === 'FREE') return true;
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? event.metaKey : event.metaKey || event.ctrlKey;
}
/** Rejects malformed presentation rather than executing configuration-supplied markup or styles. */
export function parseMapPresentation(value: unknown): MapPresentation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as MapPresentation;
  if (!Array.isArray(raw.categories) || raw.categories.length < 1 || raw.categories.length > 12) return undefined;
  const codes = new Set<string>();
  for (const category of raw.categories) {
    if (!category || typeof category.code !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(category.code) || codes.has(category.code) || typeof category.label !== 'string' || !category.label.trim() || !/^#[0-9a-f]{6}$/i.test(category.color) || !Array.isArray(category.matchTerms) || category.matchTerms.some((term: unknown) => typeof term !== 'string' || !term.trim())) return undefined;
    codes.add(category.code);
  }
  return codes.has(raw.defaultCategoryCode) ? raw : undefined;
}
/** Accepts only the bounded, declarative zoom interaction contract. */
export function parseMapInteraction(value: unknown): MapInteraction | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as MapInteraction;
  if (!['MODIFIER', 'FREE', 'DISABLED'].includes(raw.wheelZoomMode)) return undefined;
  const fields: [number, number, number][] = [[raw.wheelStep, 0.25, 3], [raw.wheelCooldownMs, 0, 1000], [raw.zoomAnimationSeconds, 0, 2]];
  return fields.every(([value, min, max]) => Number.isFinite(value) && value >= min && value <= max) ? raw : undefined;
}
