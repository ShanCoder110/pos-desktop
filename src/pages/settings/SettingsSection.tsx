import type { ReactNode } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/common";

export function SettingsSection({
  title,
  hint,
  dirty,
  onSave,
  onReset,
  children,
}: {
  title: string;
  hint: string;
  dirty: boolean;
  onSave: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-pane">
      <header className="settings-pane-head">
        <div>
          <h2>{title}</h2>
          <p>
            {hint}
            <span> · {dirty ? "Unsaved changes" : "All changes saved"}</span>
          </p>
        </div>
        <div className="settings-pane-actions">
          <Button icon={<RotateCcw size={14} />} onClick={onReset} disabled={!dirty}>
            Reset
          </Button>
          <Button variant="primary" icon={<Save size={14} />} onClick={onSave} disabled={!dirty}>
            Save
          </Button>
        </div>
      </header>
      <div className="settings-pane-body">{children}</div>
    </div>
  );
}
