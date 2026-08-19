/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import * as tenantNetwork from '../../lib/provider/immoscoutTenantNetwork.js';
import * as immoscout from '../../lib/provider/immoscout.js';

const SEARCH_URL =
  'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten?enteredFrom=one_step_search';

describe('#immoscoutTenantNetwork provider', () => {
  it('has its own id and reuses the immoscout base url', () => {
    expect(tenantNetwork.metaInformation.id).toBe('immoscout_tenant_network');
    expect(tenantNetwork.metaInformation.name).toContain('Tenant Network');
    expect(tenantNetwork.metaInformation.baseUrl).toBe(immoscout.metaInformation.baseUrl);
  });

  it('reuses the immoscout pipeline unchanged (same normalize, getListings, fetchDetails)', () => {
    // The tenant-network provider must NOT reimplement immoscout's logic - it delegates.
    expect(tenantNetwork.config.normalize).toBe(immoscout.config.normalize);
    expect(tenantNetwork.config.getListings).toBe(immoscout.config.getListings);
    expect(tenantNetwork.config.fetchDetails).toBe(immoscout.config.fetchDetails);
    expect(tenantNetwork.config.sortByDateParam).toBe(immoscout.config.sortByDateParam);
  });

  it('keeps the static template free of run-specific state', () => {
    expect(tenantNetwork.config.url).toBeNull();
    expect(tenantNetwork.config.filter).toBeUndefined();
  });

  it('injects the tenant-network parameters into the search URL', () => {
    const run = tenantNetwork.createConfig({ url: SEARCH_URL, enabled: true }, []);
    // createConfig runs the web URL through the immoscout web-to-mobile translator, so the result
    // is the mobile API url. Both tenant-network params must survive the translation - the API
    // only returns the tenant-network pool when they are sent together.
    expect(run.url).toContain('tenantNetwork=true');
    expect(run.url).toContain('features=tenantNetwork');
  });

  it('does not duplicate the tenant-network parameters if the URL already carries them', () => {
    const withParams = `${SEARCH_URL}&tenantNetwork=true&features=tenantNetwork`;
    const run = tenantNetwork.createConfig({ url: withParams, enabled: true }, []);
    expect(run.url.match(/tenantNetwork=true/g)?.length).toBe(1);
    expect(run.url.match(/features=tenantNetwork/g)?.length).toBe(1);
  });

  it('hands each createConfig call its own config object (stateless)', () => {
    const first = tenantNetwork.createConfig({ url: SEARCH_URL, enabled: true }, []);
    const second = tenantNetwork.createConfig({ url: SEARCH_URL, enabled: true }, []);
    expect(first).not.toBe(second);
    // A later createConfig must not overwrite an earlier config URL. `pagesize` survives the
    // immoscout web-to-mobile translation, so it yields a different URL without touching the first.
    const urlAfterFirst = first.url;
    tenantNetwork.createConfig({ url: `${SEARCH_URL}&pagesize=99`, enabled: true }, []);
    expect(first.url).toBe(urlAfterFirst);
    expect(first.url).toContain('tenantNetwork=true');
  });

  it('binds the blacklist to the config that was created with it', () => {
    const listing = {
      id: 'listing-1',
      title: 'Nice flat',
      description: 'Tauschwohnung near the park',
      address: 'Hauptstrasse 1, 40213 Düsseldorf',
      link: 'https://example.com/listing-1',
    };
    const filtering = tenantNetwork.createConfig({ url: SEARCH_URL, enabled: true }, ['Tauschwohnung']);
    const permissive = tenantNetwork.createConfig({ url: SEARCH_URL, enabled: true }, []);
    expect(filtering.filter(listing)).toBe(false);
    expect(permissive.filter(listing)).toBe(true);
    // Creating the permissive config must not have cleared the first config's blacklist.
    expect(filtering.filter(listing)).toBe(false);
  });
});
