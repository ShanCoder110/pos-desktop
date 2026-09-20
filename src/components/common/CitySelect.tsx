import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, SearchableSelect, toaster } from "@/components/common";
import { CITY_COPY } from "@/shared/constants/cities";
import { createMasterRecord, listAllMasterRecords, type MasterRecord } from "@/services/masters";
import { shortError } from "@/utils/format";

export function CitySelect({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (cityId: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [cities, setCities] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await listAllMasterRecords("cities", { isActive: true }, signal);
      setCities(rows.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      if (signal?.aborted) return;
      setCities([]);
      setLoadError(true);
      toaster.error(shortError(error, CITY_COPY.loadFailed));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const options = useMemo(
    () => cities.map((city) => ({ value: city.id, label: city.name })),
    [cities],
  );

  async function addCity(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = cities.find(
      (city) => city.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      onChange(existing.id);
      return;
    }
    try {
      const created = await createMasterRecord("cities", { name: trimmed, isActive: true });
      setCities((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      toaster.success(CITY_COPY.added);
    } catch (error) {
      toaster.error(shortError(error, CITY_COPY.addFailed));
    }
  }

  return (
    <Field label={CITY_COPY.label} hint={CITY_COPY.hint} error={error}>
      <SearchableSelect
        options={options}
        value={value}
        disabled={disabled || loading}
        placeholder={
          loading ? CITY_COPY.loading : loadError ? CITY_COPY.loadFailed : CITY_COPY.choose
        }
        searchPlaceholder={CITY_COPY.search}
        clearable
        onChange={onChange}
        onCreate={(name) => void addCity(name)}
        createLabel={CITY_COPY.add}
        emptyMessage={CITY_COPY.empty}
      />
    </Field>
  );
}
