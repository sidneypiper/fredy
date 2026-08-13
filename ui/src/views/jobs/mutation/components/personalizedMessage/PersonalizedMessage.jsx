/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Switch, TextArea } from '@douyinfe/semi-ui-19';
import { useSelector } from '../../../../../services/state/store';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';
import './PersonalizedMessage.less';

/**
 * The placeholders the composer prompt defines. Shown in the UI so the user knows exactly which
 * tokens the AI will replace - the same list the system prompt in messageComposer.js documents.
 */
const PLACEHOLDERS = ['{{GREETING}}', '{{AD_SENTENCE}}', '{{MOVE_IN_DATE}}', '{{AGREEMENTS}}'];

/**
 * A job's personalized message setting: a toggle plus the base text the AI personalizes per
 * listing.
 *
 * The text area is only enabled while the toggle is on, so a disabled job cannot carry a base
 * text that silently does nothing. The base text may contain the placeholders listed in the
 * hint; the AI replaces them with data from the enriched listing (greeting, a sentence about
 * what is special about the apartment, the move-in date).
 *
 * @param {Object} props
 * @param {{enabled: boolean, baseText: string}|null} props.condition
 * @param {(next: object) => void} props.onChange
 * @returns {React.ReactNode}
 */
export default function PersonalizedMessage({ condition, onChange }) {
  const t = useTranslation();
  // The toggle only makes sense once an AI provider is configured in Settings → AI; without one
  // the pipeline would have nothing to generate with.
  const aiConfigured = Boolean(useSelector((state) => state.userSettings.settings.ai_provider));
  const enabled = (condition?.enabled ?? false) && aiConfigured;
  const baseText = condition?.baseText ?? '';

  const setEnabled = (next) => onChange({ enabled: next, baseText });

  const setBaseText = (next) => onChange({ enabled, baseText: next });

  return (
    <div className="personalizedMessage">
      <div className="personalizedMessage__toggle">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          disabled={!aiConfigured}
          aria-label={t('jobs.mutation.personalizedMessageToggle')}
        />
        <span className="personalizedMessage__toggleLabel">{t('jobs.mutation.personalizedMessageToggleLabel')}</span>
      </div>
      {!aiConfigured && (
        <div className="personalizedMessage__missing">{t('jobs.mutation.personalizedMessageNoAi')}</div>
      )}
      <TextArea
        className="personalizedMessage__textarea"
        value={baseText}
        onChange={setBaseText}
        disabled={!enabled}
        placeholder={t('jobs.mutation.personalizedMessagePlaceholder')}
        autosize={{ minRows: 4, maxRows: 12 }}
      />
      <div className="personalizedMessage__hint">
        {t('jobs.mutation.personalizedMessageHint')}
        <span className="personalizedMessage__placeholders">{PLACEHOLDERS.join(' ')}</span>
      </div>
    </div>
  );
}

PersonalizedMessage.displayName = 'PersonalizedMessage';
