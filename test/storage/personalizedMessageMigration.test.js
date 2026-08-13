/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/37.personalized-message.js';

describe('migration 37 - personalized messages', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        name TEXT,
        blacklist JSONB NOT NULL DEFAULT '[]',
        provider JSONB NOT NULL DEFAULT '[]',
        notification_adapter JSONB NOT NULL DEFAULT '[]'
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT
      );
    `);
  });

  afterEach(() => db.close());

  const columns = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name);

  it('adds the condition to jobs and the message to listings', () => {
    up(db);

    expect(columns('jobs')).toContain('personalized_message');
    expect(columns('listings')).toContain('personalized_message');
  });

  it('is safe to run again', () => {
    up(db);
    expect(() => up(db)).not.toThrow();
  });
});
