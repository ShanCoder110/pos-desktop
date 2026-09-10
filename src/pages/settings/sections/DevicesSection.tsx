import { useEffect, useState } from "react";
import { Badge, EmptyRow, Table, Td, THead, Th } from "@/components/common";
import { ensureSession } from "@/services/auth";
import { listAllBranches, listDevices, mapBranch, type DeviceResponse } from "@/services/org";

export function DevicesSection() {
  const [devices, setDevices] = useState<DeviceResponse[]>([]);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [deviceRows, branches] = await Promise.all([
        listDevices(controller.signal).catch(() => [] as DeviceResponse[]),
        listAllBranches(controller.signal)
          .then((rows) => rows.map(mapBranch))
          .catch(() => []),
      ]);
      setDevices(deviceRows);
      const map: Record<string, string> = {};
      branches.forEach((b) => {
        map[b.id] = b.name;
      });
      setBranchNames(map);
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="settings-pane">
      <header className="settings-pane-head">
        <div>
          <h2>Devices</h2>
          <p>Each till is a Device. Last sync comes from SyncLog.</p>
        </div>
      </header>
      <Table>
        <THead>
          <tr>
            <Th>Device</Th>
            <Th>Branch</Th>
            <Th>Last seen</Th>
            <Th>Last sync</Th>
            <Th>Active</Th>
            <Th>Last log</Th>
          </tr>
        </THead>
        <tbody>
          {devices.length === 0 ? <EmptyRow cols={6} /> : null}
          {devices.map((device) => (
            <tr key={device.id}>
              <Td>{device.name}</Td>
              <Td>{branchNames[device.branchId] ?? device.branchId}</Td>
              <Td>{device.lastSeenAt ?? "—"}</Td>
              <Td>{device.lastSyncedAt ?? "—"}</Td>
              <Td>
                <Badge tone={device.isActive ? "ok" : "danger"}>{device.isActive ? "Yes" : "No"}</Badge>
              </Td>
              <Td>—</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
