import { Accordion, Checkbox } from "@/components/common";
import { USER_PERMISSION_GROUPS, USERS_COPY } from "@/shared/constants/staff";

export function UserPermissionEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
}) {
  function toggle(key: string, allowed: boolean) {
    onChange({ ...value, [key]: allowed });
  }

  function toggleGroup(keys: string[], next: boolean) {
    onChange({ ...value, ...Object.fromEntries(keys.map((key) => [key, next])) });
  }

  return (
    <div className="supplier-permissions-list">
      <p className="settings-note">{USERS_COPY.permissionsHint}</p>
      {USER_PERMISSION_GROUPS.map((group, index) => {
        const keys = group.permissions.map((perm) => perm.key);
        const allOn = keys.every((key) => value[key]);
        return (
          <Accordion key={group.id} title={group.label} defaultOpen={index < 2}>
            <div className="[display:grid] [gap:10px]">
              <label className="[display:flex] [align-items:center] [gap:8px] [font-size:12px] [font-weight:650] [color:var(--ink)]">
                <Checkbox
                  checked={allOn}
                  disabled={disabled}
                  onChange={(event) => toggleGroup(keys, event.target.checked)}
                />
                Select all
              </label>
              {group.permissions.map((perm) => (
                <label
                  key={perm.key}
                  className="[display:flex] [align-items:center] [gap:8px] [font-size:12px] [color:var(--ink)]"
                >
                  <Checkbox
                    checked={Boolean(value[perm.key])}
                    disabled={disabled}
                    onChange={(event) => toggle(perm.key, event.target.checked)}
                  />
                  {perm.label}
                </label>
              ))}
            </div>
          </Accordion>
        );
      })}
    </div>
  );
}
