/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import queryString from 'query-string';

// The job runner discovers providers via dynamic import, and some module graphs (notably the
// vitest graph when a test also imports the cheerio-based parser) hand a static import reached
// *through* a dynamic import a second, not-yet-initialised module record - its named exports read
// as undefined while this module is being evaluated. This adapter therefore never touches
// immoscout's exports at evaluation time: `config` is re-exported as a live binding, and
// `createConfig` reaches immoscout only when the pipeline calls it - by then every provider module
// is fully loaded. Immoscout stays the single owner of the crawling/normalising logic; this module
// only owns the tenant-network twist.
import * as immoscout from './immoscout.js';

export const metaInformation = {
  id: 'immoscout_tenant_network',
  name: 'ImmoScout24 Tenant Network',
  baseUrl: 'https://www.immobilienscout24.de/',
};

// Reuse immoscout's static template verbatim as a live re-export (normalize, getListings,
// fetchDetails, sortByDateParam, crawlFields, requiredFieldNames, priceTracking, ...). The
// template's `url` stays null and it carries no bound `filter`, so it passes the stateless contract.
export { config } from './immoscout.js';

/**
 * Append the two tenant-network parameters to an immoscout search URL, without duplicating them
 * if the caller already added them.
 *
 * @param {string} url An immoscout web search URL.
 * @returns {string} The same URL with `tenantNetwork=true` and `features=tenantNetwork`.
 */
function withTenantNetworkParams(url) {
  const { url: baseUrl, query } = queryString.parseUrl(url);
  return `${baseUrl}?${queryString.stringify({ ...query, tenantNetwork: 'true', features: 'tenantNetwork' })}`;
}

/**
 * Build a run-scoped provider configuration for the tenant-network search. Delegates to the
 * immoscout provider after injecting the tenant-network parameters into the URL, so the rest of
 * the pipeline (the web-to-mobile translation included) is immoscout's unchanged. immoscout is
 * reached lazily here, not at module evaluation.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {Object} A fresh, run-scoped immoscout provider config pointed at the tenant-network pool.
 */
export const createConfig = (sourceConfig, blacklist = []) =>
  immoscout.createConfig({ ...sourceConfig, url: withTenantNetworkParams(sourceConfig.url) }, blacklist);
