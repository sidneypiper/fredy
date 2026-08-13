/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The label used for the personalized message section in notifications.
 *
 * English like the adapters' other labels ("Commute:", "Address:", ...). The message itself is
 * in the base text's language, so the label is the only language-dependent part and stays
 * consistent across channels.
 */
export const PERSONALIZED_MESSAGE_LABEL = 'Message to the landlord';

/**
 * The personalized message section for a listing, or an empty string when the listing has none.
 *
 * Returns the raw text; HTML-capable adapters escape it before embedding. The section is a
 * separate block after the listing's own data, so the message can be copied straight out of the
 * notification and sent to the landlord.
 *
 * @param {Object} listing - The (formatted) listing object.
 * @returns {string}
 */
export const personalizedMessageSection = (listing) => {
  if (!listing?.personalizedMessage) return '';
  return `\n\n${PERSONALIZED_MESSAGE_LABEL}:\n${listing.personalizedMessage}`;
};
