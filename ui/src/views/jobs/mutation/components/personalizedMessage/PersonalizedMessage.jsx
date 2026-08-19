/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Switch, TextArea, Select, Button } from '@douyinfe/semi-ui-19';
import { IconPlusCircle, IconClose } from '@douyinfe/semi-icons';
import { useSelector } from '../../../../../services/state/store';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';
import './PersonalizedMessage.less';

/**
 * The placeholders the composer prompt defines. Shown in the UI so the user knows exactly which
 * tokens the AI will replace - the same list the system prompt in messageComposer.js documents.
 */
const PLACEHOLDERS = ['{{GREETING}}', '{{AD_SENTENCE}}', '{{MOVE_IN_DATE}}', '{{AGREEMENTS}}'];

/**
 * A job's personalized message setting: a toggle, the default base text the AI personalizes for
 * any provider, and optional per-provider overrides.
 *
 * The text areas are only enabled while the toggle is on, so a disabled job cannot carry a base
 * text that silently does nothing. The base text may contain the placeholders listed in the hint;
 * the AI replaces them with data from the enriched listing (greeting, a sentence about what is
 * special about the apartment, the move-in date). Per-provider overrides let the job use a
 * different tone per portal - e.g. a formal Sie template for landlord portals and a casual Du
 * template for tenant-network listings to a current tenant. A provider with no override falls back
 * to the default; a provider with neither gets no message.
 *
 * @param {Object} props
 * @param {{enabled: boolean, baseText: string, perProvider?: Object<string, string>}|null} props.condition
 * @param {Array<{id: string}>} [props.providers] The providers configured on this job, so the
 *   "add provider text" dropdown only offers providers the job actually uses.
 * @param {(next: object) => void} props.onChange
 * @returns {React.ReactNode}
 */
export default function PersonalizedMessage({ condition, onChange, providers }) {
  const t = useTranslation();
  // The toggle only makes sense once an AI provider is configured in Settings -> AI; without one
  // the pipeline would have nothing to generate with.
  const aiConfigured = Boolean(useSelector((state) => state.userSettings.settings.ai_provider));
  const providerMeta = useSelector((state) => state.provider);
  const storedEnabled = condition?.enabled ?? false;
  const enabled = storedEnabled && aiConfigured;
  const baseText = condition?.baseText ?? '';
  const perProvider = condition?.perProvider ?? {};

  const providerName = (id) => providerMeta?.find((p) => p.id === id)?.name ?? id;
  const overriddenIds = Object.keys(perProvider);
  const jobProviderIds = (providers ?? []).map((p) => p.id).filter(Boolean);
  const availableToAdd = jobProviderIds.filter((id) => !overriddenIds.includes(id));
  const [selectedToAdd, setSelectedToAdd] = useState('');

  // `emit` carries the stored (un-gated) enabled flag and both text buckets, so every partial
  // edit keeps the rest of the condition intact instead of dropping it.
  const emit = (next) => onChange({ enabled: storedEnabled, baseText, perProvider, ...next });
  const setEnabled = (next) => emit({ enabled: next });
  const setBaseText = (next) => emit({ baseText: next });
  const setProviderText = (id, text) => emit({ perProvider: { ...perProvider, [id]: text } });
  const removeProviderText = (id) => {
    const rest = { ...perProvider };
    delete rest[id];
    emit({ perProvider: rest });
  };
  const addOverride = () => {
    if (!selectedToAdd) return;
    emit({ perProvider: { ...perProvider, [selectedToAdd]: '' } });
    setSelectedToAdd('');
  };

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
      <div className="personalizedMessage__label">{t('jobs.mutation.personalizedMessageDefault')}</div>
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

      <div className="personalizedMessage__perProvider">
        <div className="personalizedMessage__perProviderTitle">{t('jobs.mutation.personalizedMessagePerProvider')}</div>
        {overriddenIds.map((id) => (
          <div key={id} className="personalizedMessage__perProviderEntry">
            <div className="personalizedMessage__perProviderHeader">
              <span className="personalizedMessage__perProviderName">{providerName(id)}</span>
              <Button
                icon={<IconClose />}
                size="small"
                theme="borderless"
                onClick={() => removeProviderText(id)}
                aria-label={t('jobs.mutation.personalizedMessageRemove')}
                disabled={!enabled}
              />
            </div>
            <TextArea
              className="personalizedMessage__textarea"
              value={perProvider[id]}
              onChange={(value) => setProviderText(id, value)}
              disabled={!enabled}
              placeholder={t('jobs.mutation.personalizedMessagePlaceholder')}
              autosize={{ minRows: 4, maxRows: 12 }}
            />
          </div>
        ))}
        {availableToAdd.length > 0 && (
          <div className="personalizedMessage__add">
            <Select
              value={selectedToAdd}
              onChange={setSelectedToAdd}
              placeholder={t('jobs.mutation.personalizedMessageSelectProvider')}
              disabled={!enabled}
              style={{ flex: 1 }}
            >
              {availableToAdd.map((id) => (
                <Select.Option key={id} value={id}>
                  {providerName(id)}
                </Select.Option>
              ))}
            </Select>
            <Button icon={<IconPlusCircle />} onClick={addOverride} disabled={!enabled || !selectedToAdd}>
              {t('jobs.mutation.personalizedMessageAdd')}
            </Button>
          </div>
        )}
        {availableToAdd.length === 0 && overriddenIds.length === 0 && (
          <div className="personalizedMessage__hint">{t('jobs.mutation.personalizedMessagePerProviderEmpty')}</div>
        )}
      </div>
    </div>
  );
}

PersonalizedMessage.displayName = 'PersonalizedMessage';
