/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external deps BEFORE importing the module under test.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, name: jobKey }),
}));
vi.mock('../../lib/services/markdown.js', () => ({
  readAdapterReadme: () => '',
}));

// Helpers to build mock fetch responses.
function jsonOk(body = { ok: true }) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function jsonErr(status, body) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  };
}

function imageOk(bytes = new Uint8Array([0xff, 0xd8, 0xff])) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h) => {
        const k = h.toLowerCase();
        if (k === 'content-type') return 'image/jpeg';
        if (k === 'content-length') return String(bytes.byteLength);
        return null;
      },
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

// Globals are mocked too so buildPhotoFormData (which uses global fetch) can be
// intercepted by the same single mock.
let mockNodeFetch;
let mockGlobalFetch;
let send;

beforeEach(async () => {
  // Reset modules to get a fresh import with our mocks applied.
  vi.resetModules();
  const nodeFetchMod = await import('node-fetch');
  mockNodeFetch = nodeFetchMod.default;
  mockNodeFetch.mockReset();

  mockGlobalFetch = vi.fn();
  vi.stubGlobal('fetch', mockGlobalFetch);

  ({ send } = await import('../../lib/notification/adapter/telegram.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const baseConfig = {
  id: 'telegram',
  fields: { token: 'TKN', chatId: '999' },
};

describe('telegram send() - HTTP URL path (default for .jpg / .png)', () => {
  it('POSTs JSON to sendPhoto for a .jpg image URL', async () => {
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 'Listing',
          link: 'https://example.com/a',
          address: 'Addr',
          price: '500€',
          size: '50m²',
          image: 'https://mms.immowelt.de/x/y/z/w/abc.jpg?ci_seal=hash&w=525&h=394',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockNodeFetch.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTKN/sendPhoto');
    expect(opts.method).toBe('post');
    expect(opts.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe('999');
    expect(body.photo).toBe('https://mms.immowelt.de/x/y/z/w/abc.jpg?ci_seal=hash&w=525&h=394');
    expect(body.parse_mode).toBe('HTML');
  });

  it('does NOT pre-fetch the image when using HTTP URL path', async () => {
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/x.jpg',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    // global fetch (used by buildPhotoFormData) must not be called
    expect(mockGlobalFetch).not.toHaveBeenCalled();
  });

  it('falls back to sendMessage when sendPhoto fails', async () => {
    mockNodeFetch
      .mockResolvedValueOnce(jsonErr(400, { ok: false, description: 'boom' }))
      .mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/x.jpg',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    expect(mockNodeFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botTKN/sendPhoto');
    expect(mockNodeFetch.mock.calls[1][0]).toBe('https://api.telegram.org/botTKN/sendMessage');
  });
});

describe('telegram send() - multipart path (.webp URLs)', () => {
  it('pre-fetches the image then POSTs FormData to sendPhoto for a .webp URL', async () => {
    // 1st: GET image via global fetch
    mockGlobalFetch.mockResolvedValueOnce(imageOk());
    // 2nd: POST sendPhoto via node-fetch
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 'Listing',
          link: 'https://example.com/a',
          address: 'Addr',
          price: '500€',
          size: '50m²',
          image: 'https://mms.immowelt.de/1/1/6/5/abc.webp?ci_seal=hash&w=525&h=394',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    // image was fetched
    expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
    expect(mockGlobalFetch.mock.calls[0][0]).toBe('https://mms.immowelt.de/1/1/6/5/abc.webp?ci_seal=hash&w=525&h=394');

    // sendPhoto called via node-fetch with FormData
    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockNodeFetch.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTKN/sendPhoto');
    expect(opts.method).toBe('post');
    expect(opts.body).toBeInstanceOf(FormData);
    // No explicit Content-Type header - fetch sets multipart boundary itself
    expect(opts.headers).toBeUndefined();
    expect(opts.body.get('chat_id')).toBe('999');
    expect(opts.body.get('parse_mode')).toBe('HTML');
    const photo = opts.body.get('photo');
    expect(photo).toBeTruthy();
    expect(photo.size).toBeGreaterThan(0);
  });

  it('falls back to sendMessage when the image pre-fetch fails for a .webp URL', async () => {
    // image fetch fails (404 from CDN)
    mockGlobalFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    // then sendMessage succeeds via node-fetch
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/gone.webp',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    expect(mockNodeFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botTKN/sendMessage');
  });

  it('falls back to sendMessage when multipart sendPhoto returns a Telegram error', async () => {
    mockGlobalFetch.mockResolvedValueOnce(imageOk());
    mockNodeFetch
      .mockResolvedValueOnce(jsonErr(400, { description: 'broke' })) // multipart sendPhoto
      .mockResolvedValueOnce(jsonOk()); // sendMessage fallback

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/x.webp',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    expect(mockNodeFetch.mock.calls[1][0]).toBe('https://api.telegram.org/botTKN/sendMessage');
  });
});

describe('telegram send() - mixed batch (regression-safety)', () => {
  it('handles a batch with both .jpg and .webp - jpg uses URL, webp uses multipart', async () => {
    // .webp image fetch
    mockGlobalFetch.mockResolvedValueOnce(imageOk());
    // both sendPhoto calls succeed
    mockNodeFetch
      .mockResolvedValueOnce(jsonOk()) // could be either listing first
      .mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'jpg-listing',
          title: 'a',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/a.jpg',
        },
        {
          id: 'webp-listing',
          title: 'b',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/b.webp',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockGlobalFetch).toHaveBeenCalledTimes(1); // only webp pre-fetches
    expect(mockNodeFetch).toHaveBeenCalledTimes(2);

    // Verify one call had FormData and one had JSON body
    const bodies = mockNodeFetch.mock.calls.map((c) => c[1].body);
    const hasFormData = bodies.some((b) => b instanceof FormData);
    const hasJson = bodies.some((b) => typeof b === 'string' && b.startsWith('{'));
    expect(hasFormData).toBe(true);
    expect(hasJson).toBe(true);
  });

  it('uses sendMessage (not sendPhoto) when image is null', async () => {
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: null,
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    expect(mockNodeFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botTKN/sendMessage');
    expect(mockGlobalFetch).not.toHaveBeenCalled();
  });

  it('includes the personalized message in the sendMessage body', async () => {
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: null,
          personalizedMessage: 'Sehr geehrte Frau Mustermann, ...',
        },
      ],
      notificationConfig: [baseConfig],
      jobKey: 'Berlin',
    });

    const body = JSON.parse(mockNodeFetch.mock.calls[0][1].body);
    expect(body.text).toContain('Message to the landlord:');
    expect(body.text).toContain('Sehr geehrte Frau Mustermann, ...');
  });
});

describe('telegram send() - sendLandlordMessageSeparately', () => {
  it('sends the landlord message as its own plain-text message and strips it from the listing message', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: null,
          personalizedMessage: 'Sehr geehrte Frau Mustermann, ...',
        },
      ],
      notificationConfig: [
        { id: 'telegram', fields: { token: 'TKN', chatId: '999', sendLandlordMessageSeparately: true } },
      ],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    expect(mockNodeFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botTKN/sendMessage');
    expect(mockNodeFetch.mock.calls[1][0]).toBe('https://api.telegram.org/botTKN/sendMessage');

    const listingBody = JSON.parse(mockNodeFetch.mock.calls[0][1].body);
    expect(listingBody.text).not.toContain('Message to the landlord:');
    expect(listingBody.text).not.toContain('Sehr geehrte Frau Mustermann');

    const landlordBody = JSON.parse(mockNodeFetch.mock.calls[1][1].body);
    expect(landlordBody.text).toBe('Sehr geehrte Frau Mustermann, ...');
    expect(landlordBody.parse_mode).toBeUndefined();
    expect(landlordBody.disable_web_page_preview).toBe(true);
    expect(landlordBody.chat_id).toBe('999');
  });

  it('sends the landlord message after a photo listing when the flag is on', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: 'https://example.com/x.jpg',
          personalizedMessage: 'Hallo, ...',
        },
      ],
      notificationConfig: [
        { id: 'telegram', fields: { token: 'TKN', chatId: '999', sendLandlordMessageSeparately: true } },
      ],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    expect(mockNodeFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botTKN/sendPhoto');
    expect(mockNodeFetch.mock.calls[1][0]).toBe('https://api.telegram.org/botTKN/sendMessage');

    const caption = mockNodeFetch.mock.calls[0][1].body;
    expect(caption).not.toContain('Message to the landlord:');

    const landlordBody = JSON.parse(mockNodeFetch.mock.calls[1][1].body);
    expect(landlordBody.text).toBe('Hallo, ...');
  });

  it('does not send a second message when there is no personalized message', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: null,
        },
      ],
      notificationConfig: [
        { id: 'telegram', fields: { token: 'TKN', chatId: '999', sendLandlordMessageSeparately: true } },
      ],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
  });

  it('defaults to the embedded behaviour when the flag is off', async () => {
    mockNodeFetch.mockResolvedValueOnce(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: 'a',
          title: 't',
          link: 'l',
          address: 'a',
          price: '',
          size: '',
          image: null,
          personalizedMessage: 'Sehr geehrte, ...',
        },
      ],
      notificationConfig: [
        { id: 'telegram', fields: { token: 'TKN', chatId: '999', sendLandlordMessageSeparately: false } },
      ],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockNodeFetch.mock.calls[0][1].body);
    expect(body.text).toContain('Message to the landlord:');
  });

  it('interleaves listing and landlord messages per listing (not all listings then all texts)', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immowelt',
      newListings: [
        {
          id: '1',
          title: 'Flat One',
          link: 'l1',
          address: 'a',
          price: '',
          size: '',
          image: null,
          personalizedMessage: 'LANDLORD_ONE',
        },
        {
          id: '2',
          title: 'Flat Two',
          link: 'l2',
          address: 'a',
          price: '',
          size: '',
          image: null,
          personalizedMessage: 'LANDLORD_TWO',
        },
      ],
      notificationConfig: [
        { id: 'telegram', fields: { token: 'TKN', chatId: '999', sendLandlordMessageSeparately: true } },
      ],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(4);
    const texts = mockNodeFetch.mock.calls.map((c) => JSON.parse(c[1].body).text);
    // listing1, landlord1, listing2, landlord2
    expect(texts[0]).toContain('Flat One');
    expect(texts[0]).not.toContain('LANDLORD_ONE');
    expect(texts[1]).toBe('LANDLORD_ONE');
    expect(texts[2]).toContain('Flat Two');
    expect(texts[2]).not.toContain('LANDLORD_TWO');
    expect(texts[3]).toBe('LANDLORD_TWO');
  });
});

describe('telegram send() - multiple chat IDs', () => {
  const listing = {
    id: '1',
    title: 'Flat',
    link: 'https://ex.com',
    address: 'Berlin',
    price: '800',
    size: '50',
    image: 'https://ex.com/img.jpg',
  };

  it('sends to every chat ID in a comma-separated list', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: [{ id: 'telegram', fields: { token: 'TKN', chatId: '111, 222' } }],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    const bodies = mockNodeFetch.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.chat_id)).toEqual(expect.arrayContaining(['111', '222']));
  });

  it('trims whitespace around each chat ID', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: [{ id: 'telegram', fields: { token: 'TKN', chatId: '  333 , 444  ' } }],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    const bodies = mockNodeFetch.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.chat_id)).toEqual(expect.arrayContaining(['333', '444']));
  });

  it('sends each listing to each chat ID (N listings × M chats)', async () => {
    mockNodeFetch.mockResolvedValue(jsonOk());

    await send({
      serviceName: 'immoscout',
      newListings: [listing, { ...listing, id: '2' }],
      notificationConfig: [{ id: 'telegram', fields: { token: 'TKN', chatId: '555, 666' } }],
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(4);
  });
});

describe('telegram send() - config validation', () => {
  it('throws when telegram adapter config is missing', () => {
    expect(() =>
      send({
        serviceName: 's',
        newListings: [],
        notificationConfig: [],
        jobKey: 'k',
      }),
    ).toThrow(/configuration missing/);
  });

  it('throws when token or chatId is missing', () => {
    expect(() =>
      send({
        serviceName: 's',
        newListings: [],
        notificationConfig: [{ id: 'telegram', fields: { token: '' } }],
        jobKey: 'k',
      }),
    ).toThrow(/token.*chatId/);
  });
});
