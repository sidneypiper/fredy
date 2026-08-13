/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';

/**
 * The OpenAI-compatible chat completions endpoint of Ollama Cloud.
 *
 * Ollama Cloud speaks the OpenAI wire protocol, so a minimal client is enough: one POST with a
 * Bearer key, no SDK. Cloud models ignore `response_format`, so callers embed the JSON schema in
 * the system prompt and validate the answer themselves (see messageComposer.js).
 */
export const OLLAMA_ENDPOINT = 'https://ollama.com/v1/chat/completions';

/**
 * A completed chat message.
 *
 * @typedef {Object} Completion
 * @property {string} text - The assistant's reply, trimmed.
 * @property {string} model - The model that answered (echoed from the response).
 */

/**
 * Stops calling the API for a while after a burst of failures, so a broken key or an outage does
 * not hammer the endpoint on every listing of every job run.
 */
class CircuitBreaker {
  /**
   * @param {Object} [options]
   * @param {number} [options.failures=5] - Consecutive failures that open the breaker.
   * @param {number} [options.cooldownMs=60000] - How long the breaker stays open.
   */
  constructor({ failures = 5, cooldownMs = 60_000 } = {}) {
    this.failures = failures;
    this.cooldownMs = cooldownMs;
    this._count = 0;
    this._openUntil = 0;
  }

  failure() {
    this._count += 1;
    if (this._count >= this.failures) {
      this._openUntil = Date.now() + this.cooldownMs;
      logger.warn(`AI circuit breaker opened for ${this.cooldownMs}ms`);
      this._count = 0;
    }
  }

  success() {
    this._count = 0;
  }

  isOpen() {
    return Date.now() < this._openUntil;
  }
}

/**
 * The shared circuit breaker.
 *
 * Module-level rather than per-client so a burst of failures in one job run also protects the
 * next run: the pipeline creates a fresh client per provider run, and a breaker that resets with
 * it would let a broken key hammer the endpoint on every listing of every run.
 */
const defaultBreaker = new CircuitBreaker();

/**
 * Minimal OpenAI-compatible chat client for Ollama Cloud.
 *
 * Fail-open by design: `complete()` returns `null` on any failure instead of throwing, so a
 * routing outage or a wrong key degrades the pipeline to "no personalized message" rather than
 * failing the whole job run. The caller decides what null means (see messageComposer.js, which
 * falls back to a template-only fill).
 */
export class OllamaClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - Ollama Cloud API key.
   * @param {string} [options.endpoint=OLLAMA_ENDPOINT]
   * @param {number} [options.timeoutMs=30000]
   * @param {CircuitBreaker} [options.breaker]
   */
  constructor({ apiKey, endpoint = OLLAMA_ENDPOINT, timeoutMs = 30_000, breaker }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.breaker = breaker ?? defaultBreaker;
  }

  /**
   * One chat completion. Returns null on failure (never throws).
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options]
   * @param {string} [options.model]
   * @param {number} [options.temperature=0]
   * @param {number} [options.maxTokens=1500]
   * @returns {Promise<Completion|null>}
   */
  async complete(messages, { model, temperature = 0, maxTokens = 1500 } = {}) {
    if (this.breaker.isOpen()) {
      logger.warn('AI circuit breaker open - skipping completion');
      return null;
    }
    const payload = { model, messages, temperature, max_tokens: maxTokens };
    let data;
    try {
      data = await this._post(payload);
    } catch (error) {
      this.breaker.failure();
      logger.error(`AI request failed model=${model}: ${error.message}`);
      return null;
    }
    this.breaker.success();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      logger.warn(`AI response missing content: ${JSON.stringify(data).slice(0, 200)}`);
      return null;
    }
    return { text: text.trim(), model: data?.model ?? model };
  }

  /**
   * POST the payload with one retry on network errors.
   *
   * @param {Object} payload
   * @returns {Promise<Object>} The parsed JSON response.
   */
  async _post(payload) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt === 1) {
          logger.warn(`AI request attempt ${attempt} failed, retrying: ${error.message}`);
        }
      }
    }
    throw lastError;
  }
}
