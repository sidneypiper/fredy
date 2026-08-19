/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { SpecFilter, SpatialFilter } from './filter.js' */

/**
 * A place a job's travel time condition measures against, referenced by its coordinates.
 *
 * Referenced by coordinates rather than the label so that renaming the place in the settings keeps
 * the job working - the same identity the travel time sweep matches its stored rows by. The label
 * is kept only to show in the UI.
 *
 * @typedef {Object} TravelTimeConditionPlace
 * @property {string} label Display name of the referenced place.
 * @property {number} lat
 * @property {number} lng
 * @property {number} exactMaxMinutes - How long a listing with an *exact* geocode may take to reach.
 * @property {number} coarseMaxMinutes - How long a listing with an *approximate* (postcode-level)
 *   geocode may take to reach. Meant to be the more lenient of the two.
 */

/**
 * A job's travel time filter: keep only listings within the configured commute of one of the
 * selected places. An empty `places` list means no filtering.
 *
 * @typedef {Object} TravelTimeCondition
 * @property {TravelTimeConditionPlace[]} places
 */

/**
 * A job's personalized message setting: an opt-in toggle plus the base text the AI personalizes
 * per listing. The base text may contain the placeholders the composer prompt defines
 * (`{{GREETING}}`, `{{AD_SENTENCE}}`, `{{MOVE_IN_DATE}}`); the AI replaces them with data from
 * the enriched listing. A disabled condition (or an empty base text) means no messages are
 * generated.
 *
 * @typedef {Object} PersonalizedMessageCondition
 * @property {boolean} enabled - Whether messages are generated for this job's new listings.
 * @property {string} baseText - The default base text to personalize, with placeholders. Used for
 *   any provider without a per-provider override.
 * @property {Object<string, string>} [perProvider] - Optional per-provider base text overrides,
 *   keyed by provider id. An entry for a provider overrides `baseText` for that provider's
 *   listings; providers without an entry fall back to `baseText`.
 */

/**
 * @typedef {Object} Job
 * @property {string} id Job ID.
 * @property {string} [userId] Owner user id.
 * @property {string} [name] Job display name.
 * @property {boolean} [enabled] Whether the job is enabled.
 * @property {Array<any>} [blacklist] Blacklist entries.
 * @property {Array<any>} [provider] Provider configuration list.
 * @property {Object} [notificationAdapter] Notification configuration.
 * @property {Array<string>} [shared_with_user] Users this job is shared with.
 * @property {SpatialFilter | null} [spatialFilter] Optional spatial filter configuration as GeoJSON FeatureCollection.
 * @property {SpecFilter | null} [specFilter] Optional listing specifications.
 * @property {TravelTimeCondition | null} [travelTimeCondition] Optional per-place commute thresholds.
 * @property {PersonalizedMessageCondition | null} [personalizedMessage] Optional AI-personalized
 *   message setting for new listings.
 * @property {'rent' | 'buy'} [dealType] Whether this job searches for something to rent or to buy.
 *   Decides which half of the user's finance profile applies to its listings.
 * @property {number} [numberOfFoundListings] Count of active listings for this job.
 * @property {number | null} [lastRunAt] Epoch ms at which the job was last triggered, or null if never triggered.
 */

export {};
