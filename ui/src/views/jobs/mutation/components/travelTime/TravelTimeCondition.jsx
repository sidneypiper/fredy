/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Select, InputNumber } from '@douyinfe/semi-ui-19';
import { IconPlusCircle, IconDelete } from '@douyinfe/semi-icons';
import { useSelector } from '../../../../../services/state/store';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';
import './TravelTimeCondition.less';

/** i18n keys for the saved places' travel modes. */
const MODE_LABEL_KEYS = {
  transit: 'travelTime.mode.transit',
  car: 'travelTime.mode.car',
  bike: 'travelTime.mode.bike',
  walk: 'travelTime.mode.walk',
};

/** Sensible starting thresholds when a place is picked; the user tunes them. */
const DEFAULT_EXACT_MINUTES = 30;
const DEFAULT_COARSE_MINUTES = 45;

/**
 * A job's travel time filter: keep only listings within the configured commute of one of the
 * selected places.
 *
 * The filter is a list of rows, added like providers: an empty list means no filtering, one or
 * more rows means the job only keeps listings that are within the travel time of at least one of
 * them. Each row picks one of the user's saved travel-time places (from Settings → Travel time)
 * and carries two thresholds: one for listings with an exact geocode, one for listings whose
 * address only resolved to a postcode or district (approximate) - the approximate one is meant
 * to be the more lenient.
 *
 * Places are stored by their coordinates, so renaming a place in the settings keeps the job
 * working.
 *
 * @param {Object} props
 * @param {{places: Array<{label: string|null, lat: number|null, lng: number|null, exactMaxMinutes: number|null, coarseMaxMinutes: number|null}>}|null} props.condition
 * @param {(next: object) => void} props.onChange
 * @returns {React.ReactNode}
 */
export default function TravelTimeCondition({ condition, onChange }) {
  const t = useTranslation();
  const savedPlaces = useSelector((state) => state.userSettings.settings.home_addresses);
  const allPlaces = Array.isArray(savedPlaces) ? savedPlaces : [];

  const places = condition?.places ?? [];

  const modeLabel = (place) => t(MODE_LABEL_KEYS[place?.mode] ?? MODE_LABEL_KEYS.transit);

  const addFilter = () =>
    onChange({
      places: [...places, { label: null, lat: null, lng: null, exactMaxMinutes: null, coarseMaxMinutes: null }],
    });

  const removeFilter = (index) => onChange({ places: places.filter((_, i) => i !== index) });

  const setPlace = (index, label) => {
    const saved = allPlaces.find((place) => place.label === label);
    onChange({
      places: places.map((place, i) =>
        i === index
          ? {
              ...place,
              label,
              lat: saved?.coords?.lat ?? null,
              lng: saved?.coords?.lng ?? null,
              exactMaxMinutes: place.exactMaxMinutes ?? DEFAULT_EXACT_MINUTES,
              coarseMaxMinutes: place.coarseMaxMinutes ?? DEFAULT_COARSE_MINUTES,
            }
          : place,
      ),
    });
  };

  const setThreshold = (index, key, value) =>
    onChange({ places: places.map((place, i) => (i === index ? { ...place, [key]: value ?? null } : place)) });

  // A place already used by another row is not offered again - one commute per place per job.
  const usedLabels = new Set(places.map((place) => place.label).filter(Boolean));

  return (
    <div className="travelTimeCondition">
      <Button type="primary" icon={<IconPlusCircle />} className="travelTimeCondition__add" onClick={addFilter}>
        {t('jobs.mutation.travelTimeAddFilter')}
      </Button>

      {places.length === 0 && <div className="travelTimeCondition__empty">{t('jobs.mutation.travelTimeEmpty')}</div>}

      {places.map((place, index) => {
        const saved = allPlaces.find((candidate) => candidate.label === place.label);
        return (
          <div key={index} className="travelTimeCondition__filter">
            <div className="travelTimeCondition__filterTop">
              <Select
                filter
                className="travelTimeCondition__select"
                placeholder={t('jobs.mutation.travelTimeSelectPlace')}
                value={place.label ?? undefined}
                onChange={(label) => setPlace(index, label)}
                style={{ width: '100%' }}
              >
                {allPlaces
                  .filter((candidate) => candidate.label === place.label || !usedLabels.has(candidate.label))
                  .map((candidate) => (
                    <Select.Option value={candidate.label} key={candidate.label}>
                      {candidate.label} ({modeLabel(candidate)})
                    </Select.Option>
                  ))}
              </Select>
              <Button
                icon={<IconDelete />}
                theme="borderless"
                onClick={() => removeFilter(index)}
                aria-label={t('jobs.mutation.travelTimeRemove')}
              />
            </div>
            <div className="travelTimeCondition__thresholdRow">
              <span className="travelTimeCondition__thresholdLabel">{t('jobs.mutation.travelTimeExactLabel')}</span>
              <InputNumber
                min={1}
                max={1440}
                value={place.exactMaxMinutes}
                onChange={(value) => setThreshold(index, 'exactMaxMinutes', value)}
                style={{ width: 110 }}
              />
            </div>
            <div className="travelTimeCondition__thresholdRow">
              <span className="travelTimeCondition__thresholdLabel">{t('jobs.mutation.travelTimeCoarseLabel')}</span>
              <InputNumber
                min={1}
                max={1440}
                value={place.coarseMaxMinutes}
                onChange={(value) => setThreshold(index, 'coarseMaxMinutes', value)}
                style={{ width: 110 }}
              />
            </div>
            {!saved && place.label && (
              <span className="travelTimeCondition__missing">{t('jobs.mutation.travelTimePlaceMissing')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

TravelTimeCondition.displayName = 'TravelTimeCondition';
