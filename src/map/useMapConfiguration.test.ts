import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useMapConfiguration } from './useMapConfiguration';

it('requests the public Circa surface and uses its resolved viewport', async () => {
  const configuration = {
    contractVersion: 1, surfaceCode: 'CIRCA', defaultCenter: { latitude: 25, longitude: 55 },
    defaultZoom: 9, enabledControls: [], refreshIntervalMs: 15000,
    presentation: { defaultCategoryCode: 'centre', categories: [{ code: 'centre', label: 'Centre', color: '#112233', matchTerms: [] }] },
    interaction: { wheelZoomMode: 'FREE', wheelStep: 1, wheelCooldownMs: 180, zoomAnimationSeconds: 0.4 },
  };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: configuration }) });
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(useMapConfiguration);
  try {
    await waitFor(() => expect(hook.result.current.configuration).toEqual(configuration));
    const url = new URL(fetcher.mock.calls[0]![0], 'https://circa.example');
    expect(url.pathname).toMatch(/configurations\/public$/);
    expect(url.searchParams.get('surfaceCode')).toBe('CIRCA');
    expect(url.searchParams.get('usageCode')).toBe('COLLECTION_CENTRE_MAP');
  } finally {
    hook.unmount();
    vi.unstubAllGlobals();
  }
});
