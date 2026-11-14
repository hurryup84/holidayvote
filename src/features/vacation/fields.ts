import type { OptionalField, VacationSettings } from '../../domain/models';

/** Is an optional house field switched on for this vacation? (Missing = on.) */
export function fieldOn(settings: VacationSettings, field: OptionalField): boolean {
  return settings.fields[field] !== false;
}
