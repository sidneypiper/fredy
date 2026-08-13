/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Input, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/** The only provider implemented so far. The select is a single option on purpose. */
const PROVIDERS = ['ollama'];

/** Display names for the provider values. */
const PROVIDER_LABELS = { ollama: 'Ollama Cloud' };

/** Shown as the input placeholder while a key is stored - a hint, never the key itself. */
const MASKED_KEY_PLACEHOLDER = '••••••••••••';

/**
 * The AI used to personalize messages for jobs with the feature enabled.
 *
 * Per-user like the other settings on this page: each user picks their own provider, model and
 * API key. The key is stored as a secret and never returned by the server, so the form only
 * knows whether one is stored: a masked placeholder marks it, and the clear button removes it
 * before a new one can be entered. Saving with an untouched field keeps the stored key.
 *
 * @returns {React.ReactElement}
 */
export default function AiPage() {
  const t = useTranslation();
  const actions = useActions();

  const settings = useSelector((state) => state.userSettings.settings);
  const saving = useIsLoading(actions.userSettings.setAiSettings);

  const [provider, setProvider] = useState(null);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  // True once the user cleared the stored key; the save then deletes it instead of keeping it.
  const [keyCleared, setKeyCleared] = useState(false);

  useEffect(() => {
    setProvider(settings.ai_provider ?? null);
    setModel(settings.ai_model ?? '');
    setApiKey('');
    setKeyCleared(false);
  }, [settings.ai_provider, settings.ai_model, settings.ai_api_key_set]);

  const keyStored = settings.ai_api_key_set && !keyCleared;

  const handleClearKey = () => {
    setKeyCleared(true);
    setApiKey('');
  };

  const handleSave = async () => {
    try {
      const payload = { ai_provider: provider, ai_model: model.trim() || null };
      if (keyCleared) {
        // The user cleared the stored key: delete it.
        payload.ai_api_key = null;
      } else if (apiKey.trim()) {
        // A new key was typed: replace the stored one.
        payload.ai_api_key = apiKey.trim();
      }
      // Otherwise the field was left untouched: keep the stored key (omit the field).
      await actions.userSettings.setAiSettings(payload);
      setApiKey('');
      setKeyCleared(false);
      Toast.success(t('settings.aiSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.aiSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.aiSection')} helpText={t('settings.aiSectionHelp')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 14, color: 'var(--semi-color-text-0)' }}>{t('settings.aiProviderLabel')}</label>
            </div>
            <Select
              value={provider ?? undefined}
              onChange={setProvider}
              placeholder={t('settings.aiProviderHelp')}
              style={{ width: '100%' }}
            >
              {PROVIDERS.map((p) => (
                <Select.Option value={p} key={p}>
                  {PROVIDER_LABELS[p] ?? p}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 14, color: 'var(--semi-color-text-0)' }}>{t('settings.aiModelLabel')}</label>
            </div>
            <Input
              value={model}
              onChange={setModel}
              placeholder={t('settings.aiModelPlaceholder')}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 4 }}>
              {t('settings.aiModelHelp')}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 14, color: 'var(--semi-color-text-0)' }}>{t('settings.aiApiKeyLabel')}</label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input
                type="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder={keyStored ? MASKED_KEY_PLACEHOLDER : t('settings.aiApiKeyPlaceholder')}
                style={{ flex: 1 }}
              />
              {keyStored && (
                <Button
                  icon={<IconDelete />}
                  theme="borderless"
                  onClick={handleClearKey}
                  aria-label={t('settings.aiApiKeyClear')}
                />
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 4 }}>
              {keyStored ? t('settings.aiApiKeySet') : t('settings.aiApiKeyHelp')}
            </div>
          </div>
          <div>
            <Button type="primary" icon={<IconSave />} loading={saving} onClick={handleSave}>
              {t('settings.aiSave')}
            </Button>
          </div>
        </div>
      </SegmentPart>
    </div>
  );
}

AiPage.displayName = 'AiPage';
