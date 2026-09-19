import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  EmptyRow,
  PageHead,
  Table,
  TableRowsSkeleton,
  TabSheet,
  Tabs,
  Td,
  THead,
  Th,
  toaster,
} from "@/components/common";
import { useQueryTab } from "@/hooks/useQueryTab";
import { listTrash, purgeTrash, restoreTrash, type TrashItem } from "@/services/trash";
import { shortError } from "@/utils/format";

const TRASH_TABS = [
  { id: "suppliers", label: "Suppliers" },
  { id: "customers", label: "Customers" },
  { id: "users", label: "Users" },
] as const;

export function TrashPage() {
  const [tab, setTab] = useQueryTab(TRASH_TABS, "suppliers");
  const [rows, setRows] = useState<TrashItem[]>([]);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [loading, setLoading] = useState({ page: true, action: false });

  useEffect(() => {
    const controller = new AbortController();
    setLoading((current) => ({ ...current, page: true }));
    listTrash(tab as "suppliers" | "customers" | "users", controller.signal)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading((current) => ({ ...current, page: false })));
    return () => controller.abort();
  }, [tab]);

  async function restore(id: string) {
    setLoading((current) => ({ ...current, action: true }));
    try {
      await restoreTrash(tab, id);
      setRows((current) => current.filter((row) => row.id !== id));
      toaster.success("Record restored");
    } catch (error) {
      toaster.error(shortError(error, "Could not restore record"));
    } finally {
      setLoading((current) => ({ ...current, action: false }));
    }
  }

  async function purge(id: string) {
    setLoading((current) => ({ ...current, action: true }));
    try {
      await purgeTrash(tab, id);
      setRows((current) => current.filter((row) => row.id !== id));
      setPurgeId(null);
      toaster.success("Record deleted permanently");
    } catch (error) {
      toaster.error(shortError(error, "Could not delete permanently"));
    } finally {
      setLoading((current) => ({ ...current, action: false }));
    }
  }

  return (
    <div className="ui-stack flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHead title="Trash" subtitle="Soft-deleted records" icon={<Trash2 size={17} />} />
      <TabSheet tabs={<Tabs value={tab} onChange={setTab} items={[...TRASH_TABS]} />}>
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Deleted at</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {loading.page ? <TableRowsSkeleton columnCount={2} rows={6} hasActions /> : null}
            {!loading.page && rows.length === 0 ? (
              <EmptyRow cols={3} text="Trash is empty" />
            ) : null}
            {!loading.page
              ? rows.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{new Date(row.deletedAt).toLocaleString()}</Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={loading.action}
                          onClick={() => void restore(row.id)}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={loading.action}
                          onClick={() => setPurgeId(row.id)}
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              : null}
          </tbody>
        </Table>
      </TabSheet>
      <ConfirmDialog
        open={Boolean(purgeId)}
        title="Delete permanently?"
        body="This cannot be undone. Ledger history is never removed."
        confirmLabel="Delete permanently"
        danger
        onCancel={() => setPurgeId(null)}
        onConfirm={() => purgeId && void purge(purgeId)}
      />
    </div>
  );
}
