/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaClient } from '../../../lib/services/ai/ollamaClient.js';

/** A fetch stub that answers with the given response or throws. */
const stubFetch = (responder) => {
  const fn = vi.fn(responder);
  vi.stubGlobal('fetch', fn);
  return fn;
};

const okResponse = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OllamaClient', () => {
  it('returns the assistant text on success', async () => {
    stubFetch(() =>
      okResponse({
        choices: [{ message: { content: '  Hello  ' } }],
        model: 'llama3.1',
      }),
    );
    const client = new OllamaClient({ apiKey: 'key' });
    const completion = await client.complete([{ role: 'user', content: 'hi' }], { model: 'llama3.1' });
    expect(completion).toEqual({ text: 'Hello', model: 'llama3.1' });
  });

  it('sends the Bearer key and the payload to the chat completions endpoint', async () => {
    const fetchMock = stubFetch(() => okResponse({ choices: [{ message: { content: 'ok' } }] }));
    const client = new OllamaClient({ apiKey: 'secret-key' });
    await client.complete([{ role: 'user', content: 'hi' }], { model: 'llama3.1', temperature: 0.4 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ollama.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'llama3.1',
      temperature: 0.4,
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('returns null on an HTTP error instead of throwing', async () => {
    stubFetch(() => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    const client = new OllamaClient({ apiKey: 'bad-key' });
    expect(await client.complete([], { model: 'm' })).toBeNull();
  });

  it('returns null when the response has no content', async () => {
    stubFetch(() => okResponse({ choices: [{ message: {} }] }));
    const client = new OllamaClient({ apiKey: 'key' });
    expect(await client.complete([], { model: 'm' })).toBeNull();
  });

  it('retries once on a network error and then returns null', async () => {
    const fetchMock = stubFetch(() => {
      throw new Error('ECONNRESET');
    });
    const client = new OllamaClient({ apiKey: 'key' });
    expect(await client.complete([], { model: 'm' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops calling the API while the circuit breaker is open', async () => {
    const fetchMock = stubFetch(() => {
      throw new Error('down');
    });
    const client = new OllamaClient({
      apiKey: 'key',
      breaker: { isOpen: () => true, failure: () => {}, success: () => {} },
    });
    expect(await client.complete([], { model: 'm' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
