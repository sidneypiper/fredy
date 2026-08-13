/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect, vi } from 'vitest';
import { mockFredy, sseEvents } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification } from './mocks/mockNotification.js';

// The composer is a network call; the pipeline tests only need to prove when it is invoked and
// what happens to its result. The fake answers with a deterministic body per listing.
vi.mock('../lib/services/ai/messageComposer.js', () => ({
  createComposerFromSettings: (settings) => {
    if (!settings?.ai_api_key) return null;
    return {
      compose: async (listing) => ({
        body: `Personalized: ${listing.title}`,
        subject: null,
        model: 'test',
        fallback: false,
      }),
    };
  },
}));

describe('Issue reproduction: listings filtered by similarity or area should be marked as manually deleted', () => {
  it('should call deleteListingsById when listings are filtered by similarity', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: vi.fn(() => true), // always similar
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([{ id: '1', title: 'test', address: 'addr', price: '100', link: 'http://example.com/1' }]),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    };

    const mockedJob = {
      id: 'test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'test-provider', mockSimilarityCache, undefined);

    // Clear deletedIds before test
    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    expect(mockStore.deletedIds).toContain('1');
    expect(mockSimilarityCache.checkAndAddEntry).toHaveBeenCalledWith({
      jobId: 'test-job',
      title: 'test',
      address: 'addr',
      price: '100',
    });
  });

  it('should pass the shared browser to a custom getListings implementation', async () => {
    const Fredy = await mockFredy();
    const browser = { connected: true };
    const getListings = vi.fn().mockResolvedValue([]);
    const providerConfig = {
      url: 'http://example.com',
      getListings,
      normalize: (listing) => listing,
      filter: () => true,
      crawlFields: {},
      requiredFieldNames: [],
    };
    const mockedJob = {
      id: 'custom-get-listings-browser',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'custom-provider', {}, browser);
    await fredy.execute();

    expect(getListings).toHaveBeenCalledWith('http://example.com', browser);
    expect(getListings.mock.contexts[0]).toBe(fredy);
  });

  it('should call deleteListingsById when listings are filtered by area', async () => {
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => false, // never similar
    };

    const spatialFilter = {
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 0],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };

    const mockedJob = {
      id: 'test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: spatialFilter,
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: '2',
            title: 'test',
            address: 'addr',
            price: '100',
            latitude: 2,
            longitude: 2,
            link: 'http://example.com/2',
          },
        ]), // outside polygon
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'test-provider', mockSimilarityCache, undefined);

    mockStore.deletedIds.length = 0;

    try {
      await fredy.execute();
    } catch {
      // Might throw NoNewListingsWarning if all are filtered out
    }

    expect(mockStore.deletedIds).toContain('2');
  });
});

describe('Blacklist is re-applied after detail enrichment', () => {
  afterEach(() => {
    mockStore.setUserSettings(null);
  });

  it('filters out a listing whose blacklisted term only appears in the enriched description', async () => {
    const Fredy = await mockFredy();
    const providerId = 'test-provider';

    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: true,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    // The search results page returns a clean snippet (no blacklisted term).
    // fetchDetails simulates loading the full detail page and discovers the
    // blacklisted term hidden deep in the description.
    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'kept',
            title: 'Nice house',
            address: 'Some street',
            price: '500000',
            link: 'http://example.com/kept',
            description: 'Cozy home with garden',
          },
          {
            id: 'blacklisted',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Other street',
            price: '600000',
            link: 'http://example.com/blacklisted',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) => {
        if (listing.id === 'blacklisted') {
          return Promise.resolve({
            ...listing,
            description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
          });
        }
        return Promise.resolve(listing);
      },
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'blacklist-test-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    const result = await fredy.execute();

    expect(result).toBeInstanceOf(Array);
    const ids = result.map((l) => l.id);
    expect(ids).toContain('kept');
    expect(ids).not.toContain('blacklisted');

    const notification = getLastNotification();
    const notifiedIds = (notification?.payload ?? []).map((p) => p.id);
    expect(notifiedIds).not.toContain('blacklisted');
  });

  it('short-circuits the pipeline when all listings get blacklisted after enrichment', async () => {
    const Fredy = await mockFredy();
    const providerId = 'all-blacklisted-provider';

    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: true,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'only',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Some street',
            price: '700000',
            link: 'http://example.com/only',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) =>
        Promise.resolve({
          ...listing,
          description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
        }),
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'all-blacklisted-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    // Should resolve to undefined (NoNewListingsWarning is caught in _handleError).
    const result = await fredy.execute();
    expect(result).toBeUndefined();
  });

  it('does NOT re-filter when blacklist_filter_on_provider_details is disabled', async () => {
    const Fredy = await mockFredy();
    const providerId = 'opt-out-provider';

    // provider_details enabled (so fetchDetails runs) but blacklist re-filter NOT enabled.
    mockStore.setUserSettings({
      provider_details: [providerId],
      blacklist_filter_on_provider_details: false,
    });

    const mockSimilarityCache = {
      checkAndAddEntry: () => false,
    };

    const blacklist = ['allkauf'];

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'leaks-through',
            title: 'Eleganz trifft Raumkomfort',
            address: 'Other street',
            price: '600000',
            link: 'http://example.com/leaks-through',
            description: 'Eleganz trifft Raumkomfort',
          },
        ]),
      normalize: (l) => l,
      filter: (l) => {
        const text = `${l.title ?? ''} ${l.description ?? ''}`.toLowerCase();
        return !blacklist.some((term) => text.includes(term));
      },
      fetchDetails: (listing) =>
        Promise.resolve({
          ...listing,
          description: 'Mit allkauf Haus wird dein Traum vom Eigenheim wahr.',
        }),
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const mockedJob = {
      id: 'opt-out-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, providerId, mockSimilarityCache, undefined);

    const result = await fredy.execute();

    // Listing leaks through because user has not opted in to the stricter check.
    expect(result).toBeInstanceOf(Array);
    expect(result.map((l) => l.id)).toContain('leaks-through');
  });
});

describe('Live reload triggers via SSE', () => {
  afterEach(() => {
    sseEvents.length = 0;
  });

  it('emits a listings:new event via SSE when a new listing is saved', async () => {
    sseEvents.length = 0;
    const Fredy = await mockFredy();

    const mockSimilarityCache = {
      checkAndAddEntry: () => false, // unique listing
    };

    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'brand-new-listing',
            title: 'Cool Apartment',
            address: 'Awesome Ave',
            price: '500',
            link: 'http://example.com/new',
          },
        ]),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price', link: 'link' },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link'],
    };

    const mockedJob = {
      id: 'live-reload-job',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
    };

    const fredy = new Fredy(providerConfig, mockedJob, 'live-reload-provider', mockSimilarityCache, undefined);

    await fredy.execute();

    expect(sseEvents).toHaveLength(1);
    expect(sseEvents[0]).toEqual({
      userId: 'user1',
      event: 'listings:new',
      data: {
        jobId: 'live-reload-job',
        count: 1,
      },
    });
  });
});

describe('Enrichment runs only on listings that pass the travel time filter', () => {
  afterEach(() => {
    mockStore.setUserSettings(null);
    mockStore.setJob(null);
    mockStore.setTravelTimes(new Map());
    mockStore.updatedDetails.length = 0;
  });

  it('fetches the detail page only for listings within the commute, not for the ones filtered out', async () => {
    const Fredy = await mockFredy();
    const providerId = 'travel-provider';

    mockStore.setUserSettings({ provider_details: [providerId] });
    mockStore.setJob({
      id: 'travel-job',
      userId: 'user1',
      travelTimeCondition: {
        places: [{ label: 'Home', lat: 50.94, lng: 6.96, exactMaxMinutes: 30, coarseMaxMinutes: 45 }],
      },
    });
    // The travel time sweep is not part of this test; the stored rows are handed in directly.
    mockStore.setTravelTimes(
      new Map([
        [
          'near',
          [
            {
              listing_id: 'near',
              label: 'Home',
              origin_lat: 50.94,
              origin_lng: 6.96,
              estimate_mode: 'transit',
              transit_minutes: 20,
              car_minutes: null,
              bike_minutes: null,
              walk_minutes: null,
            },
          ],
        ],
        [
          'far',
          [
            {
              listing_id: 'far',
              label: 'Home',
              origin_lat: 50.94,
              origin_lng: 6.96,
              estimate_mode: 'transit',
              transit_minutes: 60,
              car_minutes: null,
              bike_minutes: null,
              walk_minutes: null,
            },
          ],
        ],
      ]),
    );

    const fetchDetails = vi.fn((listing) => Promise.resolve({ ...listing, description: 'enriched' }));
    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          {
            id: 'near',
            title: 'Near',
            address: 'A street',
            price: '100',
            link: 'http://example.com/near',
            description: 'd',
            latitude: 50.95,
            longitude: 6.97,
          },
          {
            id: 'far',
            title: 'Far',
            address: 'B street',
            price: '200',
            link: 'http://example.com/far',
            description: 'd',
            latitude: 50.95,
            longitude: 6.97,
          },
        ]),
      normalize: (l) => l,
      filter: () => true,
      fetchDetails,
      crawlFields: {
        id: 'id',
        title: 'title',
        address: 'address',
        price: 'price',
        link: 'link',
        description: 'description',
      },
      requiredFieldNames: ['id', 'title', 'address', 'price', 'link', 'description'],
    };

    const fredy = new Fredy(
      providerConfig,
      { id: 'travel-job', notificationAdapter: null, specFilter: null, spatialFilter: null },
      providerId,
      { checkAndAddEntry: () => false },
      undefined,
    );
    mockStore.deletedIds.length = 0;

    const result = await fredy.execute();
    const ids = result.map((l) => l.id);

    // The far listing was soft-deleted by the travel filter and never notified.
    expect(ids).toContain('near');
    expect(ids).not.toContain('far');
    expect(mockStore.deletedIds).toContain('far');

    // Enrichment ran after the filter, so the detail page was fetched for the survivor only.
    expect(fetchDetails).toHaveBeenCalledTimes(1);
    expect(fetchDetails.mock.calls[0][0].id).toBe('near');

    // The enriched fields were written back to the stored row, since enrichment runs after save.
    expect(mockStore.updatedDetails).toContainEqual({
      id: 'near',
      details: { description: 'enriched', rooms: undefined, size: undefined },
    });
  });
});

describe('Personalized messages are generated for the listings that survived every filter', () => {
  afterEach(() => {
    mockStore.setUserSettings(null);
    mockStore.setJob(null);
    mockStore.updatedPersonalizedMessages.length = 0;
  });

  const baseProviderConfig = () => ({
    url: 'http://example.com',
    getListings: () =>
      Promise.resolve([
        { id: 'a', title: 'Altbau in Deutz', address: 'Köln', price: '600', link: 'http://example.com/a' },
        { id: 'b', title: 'Neubau in Porz', address: 'Köln', price: '700', link: 'http://example.com/b' },
      ]),
    normalize: (l) => l,
    filter: () => true,
    crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
    requiredFieldNames: ['id', 'title', 'address', 'price'],
  });

  it('generates and persists a message for every survivor when the job and the AI are configured', async () => {
    const Fredy = await mockFredy();
    mockStore.setUserSettings({ ai_provider: 'ollama', ai_model: 'llama3.1', ai_api_key: 'key' });
    mockStore.setJob({
      id: 'pm-job',
      userId: 'user1',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
      personalizedMessage: { enabled: true, baseText: '{{GREETING}} {{AD_SENTENCE}} Text.' },
    });
    mockStore.updatedPersonalizedMessages.length = 0;

    const fredy = new Fredy(
      baseProviderConfig(),
      { id: 'pm-job' },
      'test-provider',
      { checkAndAddEntry: () => false },
      undefined,
    );
    const result = await fredy.execute();

    expect(result.map((l) => l.personalizedMessage)).toEqual([
      'Personalized: Altbau in Deutz',
      'Personalized: Neubau in Porz',
    ]);
    expect(mockStore.updatedPersonalizedMessages).toContainEqual({
      id: 'a',
      message: 'Personalized: Altbau in Deutz',
    });
    expect(mockStore.updatedPersonalizedMessages).toContainEqual({
      id: 'b',
      message: 'Personalized: Neubau in Porz',
    });
  });

  it('skips generation when the job has the feature disabled', async () => {
    const Fredy = await mockFredy();
    mockStore.setUserSettings({ ai_provider: 'ollama', ai_model: 'llama3.1', ai_api_key: 'key' });
    mockStore.setJob({
      id: 'pm-off',
      userId: 'user1',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
      personalizedMessage: { enabled: false, baseText: '{{GREETING}} Text.' },
    });
    mockStore.updatedPersonalizedMessages.length = 0;

    const fredy = new Fredy(
      baseProviderConfig(),
      { id: 'pm-off' },
      'test-provider',
      { checkAndAddEntry: () => false },
      undefined,
    );
    const result = await fredy.execute();

    expect(result.every((l) => l.personalizedMessage == null)).toBe(true);
    expect(mockStore.updatedPersonalizedMessages).toHaveLength(0);
  });

  it('skips generation when the AI is not configured', async () => {
    const Fredy = await mockFredy();
    mockStore.setUserSettings({});
    mockStore.setJob({
      id: 'pm-noconfig',
      userId: 'user1',
      notificationAdapter: null,
      specFilter: null,
      spatialFilter: null,
      personalizedMessage: { enabled: true, baseText: '{{GREETING}} Text.' },
    });
    mockStore.updatedPersonalizedMessages.length = 0;

    const fredy = new Fredy(
      baseProviderConfig(),
      { id: 'pm-noconfig' },
      'test-provider',
      { checkAndAddEntry: () => false },
      undefined,
    );
    const result = await fredy.execute();

    expect(result.every((l) => l.personalizedMessage == null)).toBe(true);
    expect(mockStore.updatedPersonalizedMessages).toHaveLength(0);
  });
});
