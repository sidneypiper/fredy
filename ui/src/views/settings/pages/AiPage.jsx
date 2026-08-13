/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Input, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/** The only provider implemented so far. The select is a single option on purpose. */
const PROVIDERS = ['ollama'];

/**
 * The AI used to personalize messages for jobs with the feature enabled.
 *
 * Per-user like the other settings on this page: each user picks their own provider, model and
 * API key. The key is stored as a secret and never returned by the server, so the form only
 * knows whether one is stored - leaving the field empty keeps the stored key.
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

  useEffect(() => {
    setProvider(settings.ai_provider ?? null);
    setModel(settings.ai_model ?? '');
  }, [settings.ai_provider, settings.ai_model]);

  const handleSave = async () => {
    try {
      await actions.userSettings.setAiSettings({
        ai_provider: provider,
        ai_model: model.trim() || null,
        // Empty means "keep the stored key"; the server only overwrites when a value is sent.
        ai_api_key: apiKey.trim() || null,
      });
      setApiKey('');
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
                  {p}
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
            <Input
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder={t('settings.aiApiKeyPlaceholder')}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 4 }}>
              {settings.ai_api_key_set ? t('settings.aiApiKeySet') : t('settings.aiApiKeyHelp')}
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
