/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import './CoarseLocationBadge.less';

/**
 * Marks a listing whose coordinates are only a postcode or district centroid.
 *
 * Portals often report no street, and even a full address can fail to geocode once a district name
 * is appended to it. Fredy then falls back to the postcode or city centre so the listing still gets
 * a pin, a distance and a transit estimate - but that pin is not a front door, and the numbers
 * derived from it are estimates. This badge says so, next to the address, in every place the
 * address appears.
 *
 * Styled to match the transit "Estimated" chip: the same caveat, the same size, the same variables,
 * so the two read as one family. It renders inside map popups too, which is why it uses Semi's CSS
 * variables rather than the LESS tokens.
 *
 * @param {Object} props
 * @param {'exact'|'coarse'|null|undefined} [props.precision] - `geocode_precision` from the API.
 * @param {boolean} [props.compact=false] - A plain span with a `title` instead of a tooltip, for
 * the map popup where a Semi tooltip cannot be mounted.
 * @returns {React.ReactNode|null} Nothing when the location is exact or unknown.
 */
export default function CoarseLocationBadge({ precision, compact = false }) {
  const t = useTranslation();
  if (precision !== 'coarse') {
    return null;
  }

  const label = t('listing.coarseLocation');
  const hint = t('listing.coarseLocationHint');

  if (compact) {
    return (
      <span className="coarse-location" title={hint}>
        {label}
      </span>
    );
  }

  return (
    <Tooltip content={hint} position="top">
      <span className="coarse-location">{label}</span>
    </Tooltip>
  );
}

CoarseLocationBadge.displayName = 'CoarseLocationBadge';
