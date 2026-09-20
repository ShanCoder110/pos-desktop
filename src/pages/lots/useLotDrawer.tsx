import { useEffect, useState } from "react";
import { Button, Drawer, toaster } from "@/components/common";
import { LotForm } from "@/pages/lots/LotForm";
import { ProductForm } from "@/pages/products/ProductForm";
import { blankProduct } from "@/pages/products/productLots";
import {
  buildCreateProductPayload,
  buildUpdateProductPayload,
  resolveCategoryId,
} from "@/pages/products/productPayload";
import { lotCostInStockUnit, productSellUnits } from "@/pages/products/productQty";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import {
  SUPPLIER_FORM_ID,
  SupplierEditForm,
  type SupplierFormValues,
} from "@/pages/suppliers/SupplierEditForm";
import { PRODUCT_COPY } from "@/shared/constants/products";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import {
  SUPPLIER_COPY,
  SUPPLIER_OPENING_THEY_OWE,
  SUPPLIER_OPENING_WE_OWE,
} from "@/shared/constants/suppliers";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product, ProductSellUnit } from "@/shared/types";
import { ensureSession } from "@/services/auth";
import { receiveLot, receivePayloadFromLot } from "@/services/lots";
import { createMasterRecord, listMasterRecords } from "@/services/masters";
import { updateLot } from "@/services/lots";
import { createProduct, updateProduct } from "@/services/products";
import { shortError } from "@/utils/format";
import { pkMobileDigits } from "@/utils/phone";

export function newLot(_rows: ProductLotRow[]): ProductLotRow {
  return {
    id: crypto.randomUUID(),
    productId: "",
    supplierId: "",
    lotNumber: "",
    purchasePrice: 0,
    minimumPrice: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    originalQuantity: 0,
    remainingQuantity: 0,
    damagedQuantity: 0,
    receivedAt: new Date().toISOString().slice(0, 10),
    expiryDate: null,
    createdBy: "u1",
  };
}

function openingAmount(raw: string | undefined) {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  const value = Math.abs(Number(cleaned));
  return Number.isFinite(value) ? value : 0;
}

function blankSupplierRow(): SupplierRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    phone: "",
    email: "",
    address: "",
    cityId: "",
    notes: "",
    currentBalance: 0,
    previousBalance: "",
    openingSide: SUPPLIER_OPENING_WE_OWE,
    isActive: true,
  };
}

export function useLotDrawer() {
  const {
    lots,
    products,
    setProducts,
    categories,
    units,
    refreshHub,
    refreshLots,
    refreshProducts,
  } = useProductsHub();
  const [edit, setEdit] = useState<ProductLotRow | null>(null);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [apiSupplierIds, setApiSupplierIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState({ suppliers: true, saving: false, nested: false });
  const [nested, setNested] = useState<"supplier" | "product" | null>(null);
  const [nestedSupplier, setNestedSupplier] = useState<SupplierRow | null>(null);
  const [nestedProduct, setNestedProduct] = useState<Product | null>(null);

  function closeNested() {
    setNested(null);
    setNestedSupplier(null);
    setNestedProduct(null);
  }

  function closeLotDrawer() {
    closeNested();
    setEdit(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }, controller.signal)
      .then((response) => {
        setSupplierRows(
          response.data.map((record) => ({
            id: record.id,
            name: record.name,
            phone: record.phone ?? "",
            email: record.email ?? "",
            address: record.address ?? "",
            notes: record.notes ?? "",
            currentBalance: record.balance ?? 0,
            isActive: record.isActive,
          })),
        );
        setApiSupplierIds(new Set(response.data.map((record) => record.id)));
      })
      .catch(() => {
        setSupplierRows([]);
        setApiSupplierIds(new Set());
      })
      .finally(() => setLoading((current) => ({ ...current, suppliers: false })));
    return () => controller.abort();
  }, []);

  function newLotForProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    const previous = [...lots]
      .filter((lot) => lot.productId === productId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    return {
      ...newLot(lots),
      productId,
      supplierId: previous?.supplierId ?? product?.supplierId ?? "",
      purchasePrice: product
        ? lotCostInStockUnit(product, previous?.purchasePrice ?? product.cost ?? 0)
        : (previous?.purchasePrice ?? 0),
      minimumPrice: product?.min ?? 0,
      wholesalePrice: product?.wholesale ?? 0,
      retailPrice: product?.retail ?? 0,
    };
  }

  function openCreate(productId?: string) {
    setEdit(productId ? newLotForProduct(productId) : newLot(lots));
  }

  function openEdit(lot: ProductLotRow) {
    const product = products.find((item) => item.id === lot.productId);
    setEdit({
      ...lot,
      purchasePrice: product ? lotCostInStockUnit(product, lot.purchasePrice) : lot.purchasePrice,
      minimumPrice: product?.min ?? lot.minimumPrice,
      wholesalePrice: product?.wholesale ?? lot.wholesalePrice,
      retailPrice: product?.retail ?? lot.retailPrice,
    });
  }

  async function saveNestedSupplier(values: SupplierFormValues) {
    if (!nestedSupplier) return;
    setLoading((current) => ({ ...current, nested: true }));
    try {
      const phone = pkMobileDigits(values.phone);
      const payload = {
        name: values.name.trim(),
        phone: phone || undefined,
        cityId: values.cityId || undefined,
        address: values.address.trim(),
        isActive: true,
        ...(openingAmount(values.previousBalance)
          ? {
              previousBalance:
                (values.openingSide === SUPPLIER_OPENING_THEY_OWE ? -1 : 1) *
                openingAmount(values.previousBalance),
            }
          : {}),
      };
      const created = await createMasterRecord("suppliers", payload);
      const row: SupplierRow = {
        id: created.id,
        name: created.name,
        phone: created.phone ?? "",
        email: created.email ?? "",
        address: created.address ?? "",
        cityId: created.cityId ?? "",
        cityName: created.cityName ?? "",
        notes: created.notes ?? "",
        currentBalance: created.balance ?? 0,
        isActive: created.isActive,
      };
      setSupplierRows((current) => [...current, row]);
      setApiSupplierIds((prev) => new Set([...prev, created.id]));
      setEdit((current) => (current ? { ...current, supplierId: created.id } : current));
      closeNested();
      toaster.success(SUPPLIER_COPY.added);
    } catch (error) {
      toaster.error(shortError(error, SUPPLIER_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, nested: false }));
    }
  }

  async function commitNestedProduct(next: Product): Promise<boolean> {
    const category = resolveCategoryId(next, categories);
    if (!category) {
      toaster.error(PRODUCT_COPY.categoryRequired);
      return false;
    }
    if (!units.some((row) => row.symbol === next.unit)) {
      toaster.error(PRODUCT_COPY.unitRequired);
      return false;
    }
    setLoading((current) => ({ ...current, nested: true }));
    try {
      const session = await ensureSession();
      const payload = buildCreateProductPayload(next, {
        categoryId: category.id,
        units,
        branchId: session?.branchId,
      });
      if (!payload) {
        toaster.error(PRODUCT_COPY.unitRequired);
        return false;
      }
      const created = await createProduct(payload);
      await refreshProducts();
      setEdit((current) =>
        current
          ? {
              ...current,
              productId: created.id,
              supplierId: created.supplierId ?? current.supplierId,
              purchasePrice: created.cost,
              minimumPrice: created.min,
              wholesalePrice: created.wholesale,
              retailPrice: created.retail,
            }
          : current,
      );
      closeNested();
      toaster.success(PRODUCT_COPY.added);
      return true;
    } catch (error) {
      toaster.error(shortError(error, PRODUCT_COPY.saveFailed));
      return false;
    } finally {
      setLoading((current) => ({ ...current, nested: false }));
    }
  }

  async function persistSellUnits(productId: string, sellUnits: ProductSellUnit[]) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    const category = resolveCategoryId(product, categories);
    if (!category) {
      toaster.error(PRODUCT_COPY.categoryRequired);
      return;
    }
    const next: Product = { ...product, sellUnits };
    const payload = buildUpdateProductPayload(next, { categoryId: category.id, units });
    if (!payload) {
      toaster.error(PRODUCT_COPY.unitRequired);
      return;
    }
    await updateProduct(product.id, payload);
    setProducts((current) => current.map((row) => (row.id === product.id ? next : row)));
  }

  async function addProductUnit(productId: string, unit: ProductSellUnit) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    const category = resolveCategoryId(product, categories);
    if (!category) {
      toaster.error(PRODUCT_COPY.categoryRequired);
      return;
    }
    const next: Product = {
      ...product,
      sellUnits: [...productSellUnits(product), unit],
    };
    const payload = buildUpdateProductPayload(next, { categoryId: category.id, units });
    if (!payload) {
      toaster.error(PRODUCT_COPY.unitRequired);
      return;
    }
    try {
      await updateProduct(product.id, payload);
      setProducts((current) => current.map((row) => (row.id === product.id ? next : row)));
      toaster.success("Unit added to product");
    } catch (error) {
      toaster.error(shortError(error, PRODUCT_COPY.saveFailed));
      throw error;
    }
  }

  async function saveLot(lot: ProductLotRow, sellUnits?: ProductSellUnit[]) {
    const exists = lots.some((row) => row.id === lot.id);
    if (!exists) {
      if (loading.saving) return;
      setLoading((current) => ({ ...current, saving: true }));
      try {
        let supplierId = lot.supplierId;
        if (supplierId && !apiSupplierIds.has(supplierId)) {
          const local = supplierRows.find((row) => row.id === supplierId);
          if (local) {
            const created = await createMasterRecord("suppliers", {
              name: local.name,
              notes: local.notes || "Added while receiving stock",
              isActive: true,
            });
            supplierId = created.id;
            setApiSupplierIds((prev) => new Set([...prev, created.id]));
            setSupplierRows((current) =>
              current.map((row) =>
                row.id === local.id
                  ? {
                      id: created.id,
                      name: created.name,
                      phone: created.phone ?? "",
                      email: created.email ?? "",
                      address: created.address ?? "",
                      notes: created.notes ?? "",
                      currentBalance: created.balance ?? 0,
                      isActive: created.isActive,
                    }
                  : row,
              ),
            );
          }
        }
        await receiveLot(receivePayloadFromLot({ ...lot, supplierId }));
        if (sellUnits?.length) {
          await persistSellUnits(lot.productId, sellUnits);
        }
        await Promise.all([refreshLots(), refreshProducts()]);
        toaster.success("Lot added");
        closeLotDrawer();
      } catch (error) {
        toaster.error(error instanceof Error ? error.message : "Could not receive lot");
      } finally {
        setLoading((current) => ({ ...current, saving: false }));
      }
      return;
    }

    if (loading.saving) return;
    setLoading((current) => ({ ...current, saving: true }));
    const damagedQuantity = Math.min(Math.max(0, lot.damagedQuantity), lot.originalQuantity);
    const next = {
      ...lot,
      damagedQuantity,
      remainingQuantity: Math.max(
        0,
        Math.min(lot.remainingQuantity, lot.originalQuantity - damagedQuantity),
      ),
    };
    try {
      const branchAllocations = (next.branchAllocations ?? [])
        .filter((row) => row.quantity > 0)
        .map((row) => ({
          branchId: row.branchId,
          quantity: Math.round(row.quantity * 10000) / 10000,
        }));
      const allocTotal = branchAllocations.reduce((sum, row) => sum + row.quantity, 0);
      const remainingQuantity =
        branchAllocations.length > 0
          ? Math.round(allocTotal * 10000) / 10000
          : Math.round(next.remainingQuantity * 10000) / 10000;
      await updateLot(next.id, {
        supplierId: next.supplierId || undefined,
        remainingQuantity,
        damagedQuantity: next.damagedQuantity,
        cost: next.purchasePrice,
        min: next.minimumPrice,
        wholesale: next.wholesalePrice,
        retail: next.retailPrice,
        branchAllocations: branchAllocations.length ? branchAllocations : undefined,
      });
      if (sellUnits?.length) {
        await persistSellUnits(next.productId, sellUnits);
      }
      await Promise.all([refreshLots(), refreshProducts()]);
      toaster.success("Lot updated");
      closeLotDrawer();
      void refreshHub();
    } catch (error) {
      toaster.error(shortError(error, "Could not update lot"));
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  useEffect(() => {
    if (!nested) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeNested();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [nested]);

  const lotDrawer = (
    <>
      <Drawer
        open={Boolean(edit)}
        size="xl"
        form
        dim={false}
        title={edit && lots.some((row) => row.id === edit.id) ? "Edit lot" : "Add lot"}
        onClose={closeLotDrawer}
      >
        {edit ? (
          <LotForm
            lot={edit}
            lots={lots}
            products={products}
            suppliers={supplierRows}
            unitCatalog={units}
            isNew={!lots.some((row) => row.id === edit.id)}
            onAddProductUnit={addProductUnit}
            onOpenAddSupplier={() => {
              setNestedSupplier(blankSupplierRow());
              setNested("supplier");
            }}
            onOpenAddProduct={() => {
              setNestedProduct(blankProduct());
              setNested("product");
            }}
            suspendShortcuts={Boolean(nested)}
            onChange={setEdit}
            onSave={saveLot}
            onClose={closeLotDrawer}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={nested === "supplier" && Boolean(nestedSupplier)}
        size="md"
        stackLevel={1}
        title="Add supplier"
        onBack={closeNested}
        onClose={closeNested}
        footer={
          <>
            <Button onClick={closeNested} disabled={loading.nested}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={SUPPLIER_FORM_ID}
              disabled={loading.nested}
            >
              {loading.nested ? "Saving…" : "Add supplier"}
            </Button>
          </>
        }
      >
        {nestedSupplier ? (
          <SupplierEditForm
            key={nestedSupplier.id}
            row={nestedSupplier}
            isNew
            onValid={saveNestedSupplier}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={nested === "product" && Boolean(nestedProduct)}
        size="xl"
        form
        stackLevel={1}
        title="Add product"
        onBack={closeNested}
        onClose={closeNested}
      >
        {nestedProduct ? (
          <ProductForm
            product={nestedProduct}
            catalog={products}
            onChange={setNestedProduct}
            onCommit={commitNestedProduct}
            onClose={closeNested}
            saving={loading.nested}
          />
        ) : null}
      </Drawer>
    </>
  );

  return {
    edit,
    nested,
    supplierRows,
    openCreate,
    openEdit,
    closeLotDrawer,
    lotDrawer,
  };
}
