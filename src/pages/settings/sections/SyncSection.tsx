import { useEffect, useState } from "react";
import { Badge, EmptyRow, Table, Td, THead, Th, Toggle } from "@/components/common";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { ensureSession } from "@/services/auth";
import { syncStatus } from "@/services/finance";
import { listDevices, type DeviceResponse } from "@/services/org";
import { useSettingsForm } from "@/shared/settings";

const KEYS = ["isMainServer"] as const;

export function SyncSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);
  const [devices, setDevices] = useState<DeviceResponse[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [deviceRows, status] = await Promise.all([
        listDevices(controller.signal).catch(() => [] as DeviceResponse[]),
        syncStatus(controller.signal).catch(() => ({ enabled: false })),
      ]);
      setDevices(deviceRows);
      setEnabled(status.enabled);
    })();
    return () => controller.abort();
  }, []);

  return (
    <SettingsSection
      title="Backup & Sync"
      hint="Push, pull, and whether this machine is the main server"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Toggle
        checked={draft.isMainServer}
        onChange={(v) => patch({ isMainServer: v })}
        label="This machine is the main server"
      />
      <p className="settings-note text-muted">
        Cloud sync is {enabled ? "enabled" : "disabled"} on this local shop. Open till → push outbox → pull since
        Device.sync_cursor → store the new cursor when cloud is available.
      </p>
      <Table>
        <THead>
          <tr>
            <Th>Device</Th>
            <Th>Branch</Th>
            <Th>Status</Th>
            <Th>Last sync</Th>
          </tr>
        </THead>
        <tbody>
          {devices.length === 0 ? <EmptyRow cols={4} text="No devices registered" /> : null}
          {devices.map((device) => (
            <tr key={device.id}>
              <Td>{device.name}</Td>
              <Td>{device.branchId}</Td>
              <Td>
                <Badge tone={device.isActive ? "ok" : "danger"}>{device.isActive ? "Active" : "Inactive"}</Badge>
              </Td>
              <Td>{device.lastSeenAt || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SettingsSection>
  );
}
