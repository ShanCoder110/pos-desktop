import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PrintPreview } from "@/components/print/PrintPreview";
import { useDebounce } from "@/hooks/useDebounce";
import { useSettings } from "@/shared/settings";
import { routes } from "@/shared/constants/routes";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { MIN_PRODUCT_SEARCH_LENGTH } from "@/shared/constants/api";
import type { Customer, HeldBill, InvoiceLine, Product } from "@/shared/types";
import { moneyNum } from "@/utils/format";
import { consumeLots } from "@/utils/lots";
import { ensureSession } from "@/services/auth";
import { listAllProducts, searchAllProducts } from "@/services/products";
import { listMasterRecords } from "@/services/masters";
import { listHolds } from "@/services/sales";

type PriceMode = "retail" | "wholesale";
type PayMethod = "cash" | "online" | "split";
type DiscMode = "rs" | "pct";
type SellUnit = "base" | "pack";

type CartLine = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  baseUnit: string;
  sellUnit: string;
  packSize: number;
  priceMode: PriceMode;
  minPrice: number;
  listPrice: number;
  unitPrice: number;
  qty: number;
  baseQty: number;
  lineDisc: number;
  amount: number;
  lotsNote: string;
  minWarn: boolean;
};

const BANKS = ["EasyPaisa", "JazzCash", "NayaPay", "HBL Konnect", "Bank Transfer"];
const WARN_ICO = (
  <svg className="warn-ico [width:13px] [height:13px] [display:block]" viewBox="0 0 20 20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10.02 3.2a1.1 1.1 0 00-1.94 0L1.3 16.05A1.1 1.1 0 002.27 17.7h15.46a1.1 1.1 0 00.97-1.65L10.02 3.2zM10 8.2c.4 0 .7.32.7.72v3.96a.7.7 0 01-1.4 0V8.92c0-.4.3-.72.7-.72zm0 7.1a.85.85 0 110-1.7.85.85 0 010 1.7z"
    />
  </svg>
);

function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function num(v: string | number) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n: number) {
  return moneyNum(n);
}
function qtyStr(n: number) {
  const x = +Number(n).toFixed(3);
  return Number.isInteger(x) ? String(x) : String(x);
}
function prettyUnit(u: string) {
  return ({ m: "Meter", mtr: "Meter", pc: "Piece", pcs: "Piece", pack: "Pack" } as Record<string, string>)[u] || u;
}
function packOf(p: Product) {
  return p.packQty && p.packQty > 1 ? p.packQty : 0;
}
function listPrice(p: Product, mode: PriceMode) {
  return mode === "wholesale" ? p.wholesale : p.retail;
}
function clockNow() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function recompute(item: CartLine): CartLine {
  const qty = Math.max(0.001, num(item.qty));
  const unitPrice = Math.max(0, num(item.unitPrice));
  const packSize = item.packSize || 1;
  const isPack = item.sellUnit !== item.baseUnit && packSize > 1;
  const baseQty = +(qty * (isPack ? packSize : 1)).toFixed(3);
  const cut = Math.max(0, item.listPrice - unitPrice);
  return {
    ...item,
    qty,
    unitPrice,
    baseQty,
    minWarn: unitPrice < item.minPrice - 0.0001,
    lineDisc: +(cut * qty).toFixed(2),
    amount: +(qty * unitPrice).toFixed(2),
  };
}

export function PosPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unitBaseRef = useRef<HTMLButtonElement>(null);
  const unitPackRef = useRef<HTMLButtonElement>(null);
  const focusAfterSelect = useRef<"unit" | "qty" | null>(null);
  const [unitFocused, setUnitFocused] = useState(false);
  const fnRef = useRef<Record<string, () => void>>({});

  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 280);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hit, setHit] = useState(0);
  const [pending, setPending] = useState<Product | null>(null);
  const [sellUnit, setSellUnit] = useState<SellUnit>("base");
  const [qtyInput, setQtyInput] = useState("1");
  const [priceMode, setPriceMode] = useState<PriceMode>("retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState(-1);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [custQ, setCustQ] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [custHit, setCustHit] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [discPct, setDiscPct] = useState(0);
  const [discMode, setDiscMode] = useState<DiscMode>("rs");
  const [roundTarget, setRoundTarget] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [received, setReceived] = useState(0);
  const [cashAmt, setCashAmt] = useState(0);
  const [onlineAmt, setOnlineAmt] = useState(0);
  const [bank, setBank] = useState(BANKS[0]);
  const [returnChange, setReturnChange] = useState(false);
  const [note, setNote] = useState("");
  const [holds, setHolds] = useState<HeldBill[]>([]);
  const [invoices, setInvoices] = useState<{ no: string; total: number; at: string; customer: string }[]>([]);
  const [billsTip, setBillsTip] = useState(false);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [clearAfterPrint, setClearAfterPrint] = useState(false);
  const [splitPrint, setSplitPrint] = useState(false);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState(clockNow);
  const [invoiceSeq, setInvoiceSeq] = useState(1);
  const [askSupplier, setAskSupplier] = useState(false);

  const toastTimer = useRef<number>(0);
  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => {
    const id = window.setInterval(() => setClock(clockNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [productRows, customerRows, holdRows] = await Promise.all([
        listAllProducts(controller.signal).catch(() => [] as Product[]),
        listMasterRecords("customers", { perPage: MAX_PAGE_SIZE }, controller.signal)
          .then((response) =>
            response.data.map(
              (record): Customer => ({
                id: record.id,
                name: record.name,
                phone: record.phone ?? "",
                balance: 0,
                isWalking: Boolean(record.isWalkIn),
              }),
            ),
          )
          .catch(() => [] as Customer[]),
        listHolds(controller.signal).catch(() => []),
      ]);
      setProducts(productRows);
      setCustomers(customerRows);
      if (customerRows[0] && !customerId) setCustomerId(customerRows[0].id);
      setHolds(
        holdRows.map((hold) => ({
          id: hold.id,
          label: hold.label,
          customerId: hold.customerId ?? "",
          lines: [],
          at: hold.createdAt,
        })),
      );
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < MIN_PRODUCT_SEARCH_LENGTH) return;
    const controller = new AbortController();
    searchAllProducts(q, controller.signal)
      .then((hits) => {
        if (hits.length) {
          setProducts((current) => {
            const byId = new Map(current.map((p) => [p.id, p]));
            hits.forEach((p) => byId.set(p.id, p));
            return [...byId.values()];
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [debounced]);

  const customer = customers.find((c) => c.id === customerId) ?? customers[0];
  const displayCustomer: Customer = customer
    ? customer.isWalking
      ? {
          ...customer,
          name: guestName.trim() || (guestPhone ? guestPhone : "Walking Customer"),
          phone: guestPhone,
        }
      : customer
    : {
        id: "",
        name: guestName.trim() || "Walking Customer",
        phone: guestPhone,
        balance: 0,
        isWalking: true,
      };

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }, [debounced, products]);

  useEffect(() => {
    setHit(0);
  }, [debounced]);

  const custHits = useMemo(() => {
    const q = custQ.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [custQ, customers]);

  function cartStock(productId: string, exceptId?: string) {
    const held = cart
      .filter((x) => x.productId === productId && x.id !== exceptId)
      .reduce((s, x) => s + x.baseQty, 0);
    const base = products.find((p) => p.id === productId)?.stock || 0;
    return +(base - held).toFixed(3);
  }

  function totals() {
    const gross = cart.reduce((s, i) => s + i.listPrice * i.qty, 0);
    const lineDisc = cart.reduce((s, i) => s + i.lineDisc, 0);
    const afterLine = Math.max(0, gross - lineDisc);
    let billDisc =
      discMode === "pct"
        ? +((afterLine * Math.min(100, Math.max(0, discPct))) / 100).toFixed(2)
        : Math.min(Math.max(0, billDiscount), afterLine);
    if (roundTarget > 0) {
      const after = afterLine - billDisc;
      const rounded = Math.floor(after / roundTarget) * roundTarget;
      billDisc = +(billDisc + Math.max(0, after - rounded)).toFixed(2);
    }
    const total = +Math.max(0, afterLine - billDisc).toFixed(2);
    return { gross, lineDisc, billDiscount: billDisc, total, count: cart.length };
  }

  const t = totals();
  const amountPaid =
    payMethod === "cash" ? num(received) : payMethod === "online" ? num(onlineAmt) : num(cashAmt) + num(onlineAmt);
  const unpaid = +Math.max(0, t.total - amountPaid).toFixed(2);
  const extra = +Math.max(0, amountPaid - t.total).toFixed(2);
  const creditUsed = Math.max(0, Math.min(Math.max(0, customer.balance), t.total));
  // our balance: negative = owes, positive = advance
  const balanceAfter = customer.isWalking
    ? 0
    : customer.balance - creditUsed + (returnChange ? 0 : extra) - unpaid;

  const paymentOk = (() => {
    if (!cart.length) return false;
    if (customer.isWalking) return amountPaid >= t.total - 0.001;
    return true;
  })();

  function focusQty() {
    setUnitFocused(false);
    window.requestAnimationFrame(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    });
  }

  function focusUnitBar() {
    if (!pending || !packOf(pending)) {
      focusQty();
      return;
    }
    setUnitFocused(true);
    window.requestAnimationFrame(() => {
      const btn = sellUnit === "pack" ? unitPackRef.current : unitBaseRef.current;
      btn?.focus();
    });
  }

  function togglePendingUnit(stay = true) {
    if (!pending || !packOf(pending)) return;
    setSellUnit((u) => (u === "pack" ? "base" : "pack"));
    if (stay) setUnitFocused(true);
    else focusQty();
  }

  function onUnitKey(e: ReactKeyboardEvent) {
    if (!pending || !packOf(pending)) return;
    const k = e.key;
    if (
      k === "ArrowLeft" ||
      k === "ArrowRight" ||
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "/" ||
      k === " " ||
      k.toLowerCase() === "u"
    ) {
      e.preventDefault();
      e.stopPropagation();
      togglePendingUnit(true);
    } else if (k === "Enter" || (k === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      focusQty();
    } else if (k === "Escape") {
      e.preventDefault();
      setUnitFocused(false);
      searchRef.current?.focus();
    } else if (k.length === 1 && k >= "0" && k <= "9") {
      e.preventDefault();
      setQtyInput(k);
      focusQty();
    }
  }

  function selectProduct(product: Product) {
    if (product.stock <= 0) {
      showToast("Out of stock");
      return;
    }
    setPending(product);
    setSellUnit("base");
    setQuery(product.name);
    setMenuOpen(false);
    setQtyInput("1");
    focusAfterSelect.current = packOf(product) ? "unit" : "qty";
  }

  useEffect(() => {
    if (!pending || !focusAfterSelect.current) return;
    const want = focusAfterSelect.current;
    focusAfterSelect.current = null;
    window.requestAnimationFrame(() => {
      if (want === "unit") {
        setUnitFocused(true);
        unitBaseRef.current?.focus();
      } else {
        focusQty();
      }
    });
  }, [pending]);

  useEffect(() => {
    if (!unitFocused || !pending || !packOf(pending)) return;
    window.requestAnimationFrame(() => {
      (sellUnit === "pack" ? unitPackRef.current : unitBaseRef.current)?.focus();
    });
  }, [sellUnit, unitFocused, pending]);

  function addPendingToCart(supplierId?: string) {
    if (!pending) {
      showToast("Select a product first");
      return;
    }
    const entered = num(qtyInput) || 1;
    if (entered <= 0) {
      showToast("Quantity must be > 0");
      return;
    }
    const packN = packOf(pending);
    const isPack = sellUnit === "pack" && packN > 1;
    const baseQty = isPack ? entered * packN : entered;
    const left = cartStock(pending.id);
    if (baseQty > left + 0.0001) {
      showToast(`Only ${left} ${prettyUnit(pending.unit)} left`);
      return;
    }
    if (settings.stockPick === "ask" && !supplierId) {
      setAskSupplier(true);
      return;
    }
    const lot = consumeLots(pending, baseQty, settings.stockPick, supplierId);
    if ("error" in lot) {
      showToast(lot.error);
      return;
    }

    const sellU = isPack ? "pack" : pending.unit;
    const factor = isPack ? packN : 1;
    const baseP = listPrice(pending, priceMode);
    const sellPrice = +(baseP * factor).toFixed(2);
    const minSell = +((pending.min || lot.minFloor) * factor).toFixed(2);

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === pending.id && i.sellUnit === sellU && i.priceMode === priceMode,
      );
      if (existing) {
        return prev.map((i) =>
          i.id === existing.id
            ? recompute({
                ...i,
                qty: +(i.qty + entered).toFixed(3),
                lotsNote: lot.lotsNote,
              })
            : i,
        );
      }
      const line = recompute({
        id: uid(),
        productId: pending.id,
        name: pending.name,
        sku: pending.sku,
        baseUnit: pending.unit,
        sellUnit: sellU,
        packSize: packN || 1,
        priceMode,
        minPrice: minSell,
        listPrice: sellPrice,
        unitPrice: sellPrice,
        qty: entered,
        baseQty,
        lineDisc: 0,
        amount: 0,
        lotsNote: lot.lotsNote,
        minWarn: false,
      });
      return [...prev, line];
    });
    setSelected((s) => (s < 0 ? 0 : cart.length));
    setPending(null);
    setAskSupplier(false);
    setQuery("");
    setQtyInput("1");
    setRoundTarget(0);
    showToast("Added");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function patchCart(id: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.id === id ? recompute({ ...l, ...patch }) : l)));
    setRoundTarget(0);
  }

  function bumpQty(id: string, delta: number) {
    setCart((prev) => {
      const item = prev.find((x) => x.id === id);
      if (!item) return prev;
      const next = +(item.qty + delta).toFixed(3);
      if (next <= 0) return prev.filter((x) => x.id !== id);
      const left = cartStock(item.productId, item.id);
      const factor = item.sellUnit !== item.baseUnit ? item.packSize : 1;
      const max = left / factor;
      const qty = next > max + 0.0001 ? +Math.max(0.001, max).toFixed(3) : next;
      if (next > max + 0.0001) showToast(`Only ${qtyStr(max)} left`);
      return prev.map((x) => (x.id === id ? recompute({ ...x, qty }) : x));
    });
  }

  function convertUnit(id: string, to: SellUnit) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const p = products.find((x) => x.id === item.productId);
        const packN = p ? packOf(p) : 0;
        if (!packN) return item;
        const wantPack = to === "pack";
        const isPack = item.sellUnit !== item.baseUnit;
        if (wantPack === isPack) return item;
        const f = isPack ? item.packSize : 1;
        const pricePerBase = item.unitPrice / f;
        const listPerBase = item.listPrice / f;
        const minPerBase = item.minPrice / f;
        const baseQty = item.baseQty;
        if (wantPack) {
          return recompute({
            ...item,
            sellUnit: "pack",
            packSize: packN,
            qty: +(baseQty / packN).toFixed(3),
            unitPrice: +(pricePerBase * packN).toFixed(2),
            listPrice: +(listPerBase * packN).toFixed(2),
            minPrice: +(minPerBase * packN).toFixed(2),
          });
        }
        return recompute({
          ...item,
          sellUnit: item.baseUnit,
          qty: +baseQty.toFixed(3),
          unitPrice: +pricePerBase.toFixed(2),
          listPrice: +listPerBase.toFixed(2),
          minPrice: +minPerBase.toFixed(2),
        });
      }),
    );
  }

  function setLineMode(id: string, mode: PriceMode) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const p = products.find((x) => x.id === item.productId);
        if (!p) return item;
        const factor = item.sellUnit !== item.baseUnit ? item.packSize : 1;
        const sell = +(listPrice(p, mode) * factor).toFixed(2);
        return recompute({
          ...item,
          priceMode: mode,
          listPrice: sell,
          unitPrice: sell,
          minPrice: +(p.min * factor).toFixed(2),
          lineDisc: 0,
        });
      }),
    );
  }

  function switchAllCart(mode?: PriceMode) {
    if (!cart.length) {
      showToast("Cart is empty");
      return;
    }
    const allW = cart.every((i) => i.priceMode === "wholesale");
    const next = mode ?? (allW ? "retail" : "wholesale");
    setPriceMode(next);
    setCart((prev) =>
      prev.map((item) => {
        const p = products.find((x) => x.id === item.productId);
        if (!p) return item;
        const factor = item.sellUnit !== item.baseUnit ? item.packSize : 1;
        const sell = +(listPrice(p, next) * factor).toFixed(2);
        return recompute({
          ...item,
          priceMode: next,
          listPrice: sell,
          unitPrice: sell,
          minPrice: +(p.min * factor).toFixed(2),
          lineDisc: 0,
        });
      }),
    );
    setRoundTarget(0);
    showToast(next === "wholesale" ? "All items wholesale" : "All items retail");
  }

  function newBill(silent = false) {
    setCart([]);
    setSelected(-1);
    setPending(null);
    setBillDiscount(0);
    setDiscPct(0);
    setRoundTarget(0);
    setReceived(0);
    setCashAmt(0);
    setOnlineAmt(0);
    setPayMethod("cash");
    setReturnChange(false);
    setQuery("");
    setQtyInput("1");
    setNote("");
    setCustomerId("c0");
    setGuestName("");
    setGuestPhone("");
    setCustQ("");
    if (!silent) showToast("New bill");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function clearCart() {
    if (!cart.length) {
      showToast("Cart is empty");
      return;
    }
    if (!window.confirm(`Remove all ${cart.length} item(s) from this bill?`)) return;
    setCart([]);
    setSelected(-1);
    showToast("Cart cleared");
  }

  function cancelBill() {
    const dirty = cart.length || billDiscount || discPct || !customer.isWalking;
    if (!dirty) {
      showToast("Nothing to cancel");
      return;
    }
    if (!window.confirm("Cancel this invoice? The cart will be cleared.")) return;
    newBill(true);
    showToast("Invoice cancelled");
  }

  function holdInvoice() {
    if (!cart.length) {
      if (holds.length) {
        setHoldsOpen(true);
        return;
      }
      showToast("Cart is empty");
      return;
    }
    const lines: InvoiceLine[] = cart.map((c) => ({
      id: c.id,
      productId: c.productId,
      name: c.name,
      qty: c.baseQty,
      unit: c.baseUnit,
      price: c.unitPrice / (c.sellUnit !== c.baseUnit ? c.packSize : 1),
      minFloor: c.minPrice / (c.sellUnit !== c.baseUnit ? c.packSize : 1),
      lotsNote: c.lotsNote,
    }));
    setHolds((prev) => [
      {
        id: uid(),
        label: `${displayCustomer.name} · ${cart.length} items`,
        customerId,
        lines,
        at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
    // also stash rich cart in session via lines only for restore - store full cart in note field workaround
    sessionStorage.setItem(
      `hold-cart-${holds.length}`,
      JSON.stringify({ cart, customerId, guestName, guestPhone, priceMode, billDiscount, discMode, discPct }),
    );
    newBill(true);
    showToast("Invoice held");
  }

  function applyExact() {
    if (!t.total) {
      showToast("Add products first");
      return;
    }
    if (payMethod === "online") setOnlineAmt(t.total);
    else if (payMethod === "split") {
      const left = +Math.max(0, t.total - cashAmt - onlineAmt).toFixed(2);
      setCashAmt(+(cashAmt + left).toFixed(2));
    } else {
      setPayMethod("cash");
      setReceived(t.total);
    }
    showToast("Exact amount");
  }

  function setPay(method: PayMethod) {
    setPayMethod(method);
    if (method === "cash") setReceived(t.total || received);
    if (method === "online") {
      setOnlineAmt(t.total || onlineAmt);
      setCashAmt(0);
    }
    if (method === "split") {
      setCashAmt(0);
      setOnlineAmt(0);
    }
  }

  function applyRound(unit: number) {
    setRoundTarget(unit);
    if (!unit) return;
    if (discMode === "pct") setDiscMode("rs");
    const afterLine = Math.max(0, t.gross - t.lineDisc);
    const afterBill = afterLine - (discMode === "pct" ? (afterLine * discPct) / 100 : billDiscount);
    const rounded = Math.floor(afterBill / unit) * unit;
    const roundAmt = +Math.max(0, afterBill - rounded).toFixed(2);
    const currentDisc = discMode === "pct" ? (afterLine * discPct) / 100 : billDiscount;
    setBillDiscount(+(currentDisc + roundAmt).toFixed(2));
    setDiscMode("rs");
    if (roundAmt > 0) showToast(`${money(roundAmt)} added to bill discount`);
  }

  function completeSale() {
    if (!cart.length) {
      showToast("Cart is empty");
      return;
    }
    if (!paymentOk) {
      showToast(customer.isWalking ? "Walk-in must pay in full" : "Payment incomplete");
      return;
    }
    const below = cart.filter((c) => c.minWarn);
    if (below.length && settings.minPriceRule) {
      if (!window.confirm("Some items are below minimum price. Continue?")) return;
    }
    if (unpaid > 0.001 || extra > 0.001 || t.total >= 10000) {
      const noteMsg =
        unpaid > 0.001
          ? ` Unpaid ${money(unpaid)} will add to ${displayCustomer.name} balance.`
          : extra > 0.001
            ? ` Extra ${money(extra)} will ${returnChange ? "be returned as change" : "add to balance"}.`
            : "";
      if (!window.confirm(`Complete sale ${money(t.total)}?${noteMsg}`)) return;
    }
    const no = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(invoiceSeq).padStart(4, "0")}`;
    setInvoices((prev) => [
      { no, total: t.total, at: new Date().toLocaleString(), customer: displayCustomer.name },
      ...prev,
    ]);
    setInvoiceSeq((n) => n + 1);
    setClearAfterPrint(true);
    setPrintOpen(true);
    showToast(`Sale ${no} complete`);
  }

  function onSearchEnter() {
    if (pending && query.trim().toLowerCase() === pending.name.toLowerCase()) {
      addPendingToCart();
      return;
    }
    if (menuOpen && results.length) {
      selectProduct(results[hit] || results[0]);
      return;
    }
    if (!results.length) {
      showToast("No product found");
      setMenuOpen(true);
      return;
    }
    const exact = results.find(
      (p) =>
        p.sku.toLowerCase() === query.trim().toLowerCase() ||
        p.name.toLowerCase() === query.trim().toLowerCase(),
    );
    selectProduct(exact || results[hit] || results[0]);
  }

  useEffect(() => {
    fnRef.current = {
      F1: () => showToast("F2 customer · F3 search · F4 hold · F7 exact · F12 sale"),
      F2: () => {
        setCustOpen(true);
        window.setTimeout(() => document.getElementById("customerSearch")?.focus(), 0);
      },
      F3: () => {
        searchRef.current?.focus();
        searchRef.current?.select();
        setMenuOpen(true);
      },
      F4: () => holdInvoice(),
      F5: () => cancelBill(),
      F6: () => {
        if (cart.length) {
          setSelected(0);
          showToast("Cart focused — edit qty on the selected row");
        } else showToast("Cart is empty");
      },
      F7: () => applyExact(),
      F8: () => document.getElementById("billDiscount")?.focus(),
      F9: () => {
        if (cart.length) setPrintOpen(true);
        else showToast("Nothing to print");
      },
      F10: () => {
        setSplitPrint((v) => {
          showToast(!v ? "Split print on" : "Split print off");
          return !v;
        });
      },
      F11: () => switchAllCart(),
      F12: () => completeSale(),
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setCustOpen(false);
        setBillsTip(false);
        setHoldsOpen(false);
        setRecentOpen(false);
        return;
      }
      if (!/^F([1-9]|1[0-2])$/.test(e.key)) return;
      // Stop browser defaults (F5 refresh, F12 tools, etc.)
      e.preventDefault();
      e.stopPropagation();
      if (printOpen || holdsOpen || recentOpen || askSupplier) return;
      fnRef.current[e.key]?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [printOpen, holdsOpen, recentOpen, askSupplier]);

  useEffect(() => {
    if (payMethod === "cash" && t.total && received === 0) setReceived(t.total);
  }, [t.total, payMethod]); // eslint-disable-line

  const invoiceLines: InvoiceLine[] = cart.map((c) => ({
    id: c.id,
    productId: c.productId,
    name: c.name,
    qty: c.qty,
    unit: c.sellUnit,
    price: c.unitPrice,
    minFloor: c.minPrice,
    lotsNote: c.lotsNote,
  }));

  const cartAllMode = !cart.length
    ? ""
    : cart.every((i) => i.priceMode === "wholesale")
      ? "wholesale"
      : cart.every((i) => i.priceMode === "retail")
        ? "retail"
        : "mixed";

  const qtyHint = (() => {
    if (!pending) return null;
    const left = cartStock(pending.id);
    const packN = packOf(pending);
    const isPack = sellUnit === "pack" && packN > 1;
    const entered = num(qtyInput);
    const need = isPack ? entered * packN : entered;
    const over = need > left + 0.0001;
    const low = left < 10;
    if (isPack) {
      const packsLeft = Math.floor(left / packN + 1e-9);
      const rem = +(left - packsLeft * packN).toFixed(3);
      return {
        cls: over ? "is-over" : low ? "is-low" : "",
        lines: [
          `Left ${qtyStr(packsLeft)} Pack${rem > 0 ? ` + ${qtyStr(rem)} ${prettyUnit(pending.unit)}` : ""}`,
          entered > 0 ? `${qtyStr(entered)} Pack = ${qtyStr(entered * packN)} ${prettyUnit(pending.unit)}` : "",
        ].filter(Boolean),
      };
    }
    return {
      cls: over ? "is-over" : low ? "is-low" : "",
      lines: [`Left ${qtyStr(left)} ${prettyUnit(pending.unit)}`],
    };
  })();

  return (
    <>
      <main className="workspace [grid-column:2] [grid-row:1] [display:grid] [grid-template-columns:1fr_360px] [min-height:0] [overflow:hidden]">
        <section className="stage [display:flex] [flex-direction:column] [min-height:0] [padding:8px_6px_8px_8px] [gap:4px]">
          <div className="search-row [display:flex] [gap:6px] [align-items:stretch] [flex-shrink:0] [height:48px]">
            <div className="search-wrap [position:relative] [flex:1] [min-width:0]">
              <svg className="search-icon [position:absolute] [left:10px] [top:50%] [transform:translateY(-50%)] [width:16px] [height:16px] [color:var(--muted)] [pointer-events:none] [color:var(--search)]" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                ref={searchRef}
                id="productSearch"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search product, SKU or barcode — F3"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPending(null);
                  setMenuOpen(true);
                }}
                onClick={() => {
                  if (!pending) setMenuOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMenuOpen(true);
                    setHit((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHit((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchEnter();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setMenuOpen(false);
                  }
                }}
              />
              <div className="search-results [position:absolute] [left:0] [right:0] [top:calc(100%_+_2px)] [background:#fff] [border:1px_solid_var(--line)] [border-radius:8px] [box-shadow:var(--shadow)] [z-index:20] [height:380px] [overflow-x:hidden] [overflow-y:auto] [scrollbar-width:none] [-ms-overflow-style:none]" hidden={!menuOpen || !results.length}>
                {results.map((p, i) => {
                  const left = cartStock(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`search-hit [display:grid] [grid-template-columns:60px_1fr_auto_auto] [gap:8px] [padding:0_10px] [cursor:pointer] [align-items:center] [border-bottom:1px_solid_#f8fafc] [font-size:13px] [height:38px] [box-sizing:border-box] ${i === hit ? "is-active" : ""} ${left < 10 ? "is-low" : ""}`}
                      onMouseEnter={() => setHit(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectProduct(p);
                      }}
                    >
                      <span className="sku">{p.sku}</span>
                      <span className="name">
                        <span className="name-text">
                          {p.name}
                          <small>
                            {" "}
                            {prettyUnit(p.unit)}
                            {packOf(p) ? ` · Pack of ${packOf(p)}` : ""}
                          </small>
                        </span>
                      </span>
                      <span className={`stock ${left < 10 ? "is-low" : ""}`}>
                        {qtyStr(left)} {prettyUnit(p.unit)}
                      </span>
                      <span className="price">{money(listPrice(p, priceMode))}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="button" className="cat-btn [border:1px_solid_#c7d2fe] [background:#fff] [color:var(--sub)] [padding:0_12px] [border-radius:6px] [cursor:pointer] [font-weight:600] [font-size:13px] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] [flex-shrink:0] [align-self:stretch] [white-space:nowrap]" onClick={() => showToast("Categories coming next")}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3.5 6.5h5l1.2 1.5H16.5v7.5H3.5V6.5z" />
                <path d="M3.5 6.5V5.2A1.2 1.2 0 014.7 4h3.1l1.2 1.5" />
              </svg>
              <span>Categories</span>
              <kbd>⇧F3</kbd>
            </button>

            <div className="price-mode [display:flex] [background:#fff] [border:1px_solid_#c7d2fe] [padding:3px] [border-radius:6px] [flex-shrink:0] [align-self:stretch]" role="group" aria-label="Price mode">
              <button
                type="button"
                className={`mode-btn [border:0] [background:transparent] [color:var(--sub)] [padding:0_12px] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:13px] [transition:all_.15s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] ${priceMode === "retail" ? "is-active" : ""}`}
                onClick={() => {
                  setPriceMode("retail");
                  showToast("Add as retail");
                }}
              >
                Retail
              </button>
              <button
                type="button"
                id="btnWholesale"
                className={`mode-btn [border:0] [background:transparent] [color:var(--sub)] [padding:0_12px] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:13px] [transition:all_.15s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] ${priceMode === "wholesale" ? "is-active" : ""}`}
                onClick={() => {
                  setPriceMode("wholesale");
                  showToast("Add as wholesale");
                }}
              >
                Wholesale
              </button>
            </div>

            <div className={`unit-box [display:flex] [flex-direction:column] [justify-content:center] [background:#f0fdfa] [border:1px_solid_#99f6e4] [border-radius:6px] [padding:2px_6px_4px] [min-width:186px] [flex-shrink:0] ${unitFocused ? "is-focus" : ""}`} hidden={!pending}>
              <span className="qty-label [font-size:10px] [font-weight:700] [color:var(--gold)] [letter-spacing:.06em] [display:flex] [align-items:center] [justify-content:space-between]">
                UNIT <kbd>← →</kbd>
              </span>
              <div className="unit-toggles [display:flex] [gap:4px]" id="unitToggles">
                {pending ? (
                  <>
                    <button
                      ref={unitBaseRef}
                      type="button"
                      className={`unit-tog [flex:1] [height:28px] [border:1px_solid_var(--line)] [background:#f8fafc] [border-radius:5px] [cursor:pointer] [font-size:12px] [font-weight:600] [color:var(--ink)] [white-space:nowrap] [padding:0_8px] ${sellUnit === "base" ? "is-active" : ""}`}
                      tabIndex={sellUnit === "base" ? 0 : -1}
                      disabled={!packOf(pending)}
                      onClick={() => {
                        setSellUnit("base");
                        focusQty();
                      }}
                      onKeyDown={onUnitKey}
                      onFocus={() => setUnitFocused(true)}
                      onBlur={() => {
                        window.setTimeout(() => {
                          const active = document.activeElement;
                          if (active !== unitBaseRef.current && active !== unitPackRef.current) {
                            setUnitFocused(false);
                          }
                        }, 0);
                      }}
                    >
                      {prettyUnit(pending.unit)}
                    </button>
                    {packOf(pending) ? (
                      <button
                        ref={unitPackRef}
                        type="button"
                        className={`unit-tog [flex:1] [height:28px] [border:1px_solid_var(--line)] [background:#f8fafc] [border-radius:5px] [cursor:pointer] [font-size:12px] [font-weight:600] [color:var(--ink)] [white-space:nowrap] [padding:0_8px] ${sellUnit === "pack" ? "is-active" : ""}`}
                        tabIndex={sellUnit === "pack" ? 0 : -1}
                        onClick={() => {
                          setSellUnit("pack");
                          focusQty();
                        }}
                        onKeyDown={onUnitKey}
                        onFocus={() => setUnitFocused(true)}
                        onBlur={() => {
                          window.setTimeout(() => {
                            const active = document.activeElement;
                            if (active !== unitBaseRef.current && active !== unitPackRef.current) {
                              setUnitFocused(false);
                            }
                          }, 0);
                        }}
                      >
                        Pack of {packOf(pending)}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className="qty-box [display:flex] [flex-direction:column] [justify-content:center] [background:#fffbeb] [border:1px_solid_#fcd34d] [border-radius:6px] [padding:2px_8px_4px] [width:88px] [flex-shrink:0] [position:relative]">
              <span className="qty-label [font-size:10px] [font-weight:700] [color:var(--gold)] [letter-spacing:.06em] [display:flex] [align-items:center] [justify-content:space-between]">
                QTY <kbd>↵</kbd>
              </span>
              <input
                ref={qtyRef}
                id="qtyInput"
                type="number"
                min={0.001}
                step="any"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPendingToCart();
                  } else if (
                    (e.key === "/" || e.key.toLowerCase() === "u") &&
                    pending &&
                    packOf(pending)
                  ) {
                    e.preventDefault();
                    togglePendingUnit(false);
                  } else if (e.key === "Tab" && e.shiftKey && pending && packOf(pending)) {
                    e.preventDefault();
                    focusUnitBar();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    searchRef.current?.focus();
                  }
                }}
              />
              <span className={`qty-hint [position:absolute] [top:calc(100%_+_3px)] [right:0] [z-index:16] [min-width:100%] [font-family:var(--mono)] [font-size:10px] [font-weight:700] [color:#854d0e] [background:#fffbeb] [border:1px_solid_#fcd34d] [border-radius:4px] [padding:3px_6px] [line-height:1.25] [white-space:nowrap] [text-align:right] [display:flex] [flex-direction:column] [align-items:flex-end] [gap:1px] [box-shadow:0_4px_10px_rgba(15,23,42,.08)] ${qtyHint?.cls || ""}`} hidden={!qtyHint}>
                {qtyHint?.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </div>

            <button type="button" className="btn-add [width:96px] [flex-shrink:0] [border:0] [background:var(--accent)] [color:#fff] [border-radius:6px] [font-weight:700] [font-size:13px] [cursor:pointer] [transition:background_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:5px]" id="btnAdd" onClick={() => addPendingToCart()}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add ↵
            </button>
          </div>

          <div className="cart-panel [flex:1] [min-height:0] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:var(--radius)] [display:flex] [flex-direction:column] [overflow:hidden]">
            <div className="cart-head [display:flex] [justify-content:space-between] [align-items:center] [padding:0_12px] [height:38px] [flex-shrink:0] [background:linear-gradient(90deg,_#0f172a,_#134e4a)] [color:#e2e8f0] [font-size:12px] [font-weight:600] [letter-spacing:.04em] [text-transform:uppercase]">
              <span className="cart-head-left [display:inline-flex] [align-items:center] [gap:10px]">
                Cart <span className="cart-badge [background:var(--accent)] [color:#fff] [font-size:11px] [font-weight:700] [padding:2px_7px] [border-radius:99px] [margin-left:4px]">{cart.length}</span>
                <span className="cart-all-mode [display:inline-flex] [gap:3px]" role="group">
                  <button
                    type="button"
                    id="btnCartRetail"
                    className={cartAllMode === "retail" ? "is-on" : ""}
                    onClick={() => switchAllCart("retail")}
                  >
                    All retail
                  </button>
                  <button
                    type="button"
                    id="btnCartWholesale"
                    className={cartAllMode === "wholesale" ? "is-on" : ""}
                    onClick={() => switchAllCart("wholesale")}
                  >
                    All wholesale
                  </button>
                </span>
              </span>
              <div className="cart-head-right [display:flex] [align-items:center] [gap:8px]">
                <span className="today-stats [display:flex] [align-items:center] [gap:8px] [font-family:var(--mono)] [font-size:11px] [color:#cbd5e1] [font-weight:500]">
                  <span>Today {invoices.length} bills</span>
                  <span id="todayCash">Cash {money(invoices.reduce((s, i) => s + i.total, 0))}</span>
                </span>
                <button type="button" className="cart-clear [border:0] [background:#dc2626] [color:#fff] [font-size:11px] [font-weight:700] [padding:4px_9px] [border-radius:4px] [cursor:pointer] [text-transform:uppercase] [letter-spacing:.04em] [display:inline-flex] [align-items:center] [gap:4px]" onClick={clearCart}>
                  Clear
                </button>
              </div>
            </div>
            <div className="cart-scroll [flex:1] [overflow:auto] [min-height:0]">
              <table className="cart-table [width:100%] [border-collapse:collapse] [table-layout:fixed]">
                <thead>
                  <tr>
                    <th className="c-hash [width:36px] [text-align:center] [color:var(--muted)]">#</th>
                    <th className="c-item [width:auto] [text-align:left]">Item</th>
                    <th className="c-stock [width:108px] [text-align:right]">Stock</th>
                    <th className="c-qty [width:118px] [text-align:right]">Qty</th>
                    <th className="c-price [width:126px] [text-align:right]">Price</th>
                    <th className="c-disc [width:88px] [text-align:right]">Disc</th>
                    <th className="c-amt [width:112px] [text-align:right]">Amount</th>
                    <th className="c-del [width:48px] [text-align:center]" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => {
                    const left = cartStock(item.productId);
                    const packN = item.packSize > 1 ? item.packSize : 0;
                    const isPack = item.sellUnit !== item.baseUnit;
                    return (
                      <tr
                        key={item.id}
                        className={`${i === selected ? "is-selected" : ""} ${item.minWarn ? "is-min-price" : ""} ${item.lineDisc > 0.001 ? "has-disc" : ""} ${left < -0.0001 ? "is-over" : ""}`}
                        onClick={() => setSelected(i)}
                      >
                        <td className="c-hash [width:36px] [text-align:center] [color:var(--muted)]">{i + 1}</td>
                        <td className="c-item [width:auto] [text-align:left]">
                          <span className="item-name [font-weight:600] [display:flex] [align-items:center] [gap:6px] [min-width:0]">
                            <span className="name-text">{item.name}</span>
                          </span>
                          <span className="item-sku [font-size:11px] [color:var(--muted)] [font-family:var(--mono)] [display:block]">
                            {item.sku} · {qtyStr(item.qty)} {prettyUnit(item.sellUnit)}
                            {isPack ? ` = ${qtyStr(item.baseQty)} ${prettyUnit(item.baseUnit)}` : ""}
                          </span>
                          {packN ? (
                            <span className="line-units [display:inline-flex] [gap:3px] [margin-top:4px] [margin-right:6px]">
                              <button
                                type="button"
                                className={!isPack ? "is-active" : ""}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  convertUnit(item.id, "base");
                                }}
                              >
                                {prettyUnit(item.baseUnit)}
                              </button>
                              <button
                                type="button"
                                className={isPack ? "is-active" : ""}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  convertUnit(item.id, "pack");
                                }}
                              >
                                Pack of {packN}
                              </button>
                            </span>
                          ) : (
                            <span className="unit-badge [display:inline-block] [margin-left:6px] [padding:1px_7px] [background:var(--accent-bg)] [color:#0f766e] [border-radius:99px] [font-size:11px] [font-weight:700] [font-family:var(--mono)] [vertical-align:middle]">{prettyUnit(item.sellUnit)}</span>
                          )}
                          <span className="line-units [display:inline-flex] [gap:3px] [margin-top:4px] [margin-right:6px] line-price">
                            <button
                              type="button"
                              data-pm="retail"
                              className={item.priceMode !== "wholesale" ? "is-active" : ""}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLineMode(item.id, "retail");
                              }}
                            >
                              R
                            </button>
                            <button
                              type="button"
                              data-pm="wholesale"
                              className={item.priceMode === "wholesale" ? "is-active" : ""}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLineMode(item.id, "wholesale");
                              }}
                            >
                              W
                            </button>
                          </span>
                        </td>
                        <td className="c-stock [width:108px] [text-align:right]">
                          <span className={`stock-val [font-family:var(--mono)] [font-size:12px] [color:var(--sub)] [white-space:nowrap] [display:inline-flex] [align-items:center] [justify-content:flex-end] [gap:4px] ${left < 10 ? "is-low" : ""}`}>
                            {left < 10 ? WARN_ICO : null}
                            <span className="stock-num">
                              {qtyStr(left)} {prettyUnit(item.baseUnit)}
                            </span>
                          </span>
                        </td>
                        <td className="c-qty [width:118px] [text-align:right]">
                          <div className="qty-step [display:flex] [align-items:center] [justify-content:flex-end] [gap:2px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpQty(item.id, -1);
                              }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0.001}
                              step="any"
                              value={qtyStr(item.qty)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => patchCart(item.id, { qty: num(e.target.value) })}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpQty(item.id, 1);
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className={`c-price [width:126px] [text-align:right] ${item.minWarn ? "is-min" : ""}`}>
                          <div className="price-cell [position:relative] [height:32px]">
                            <div className="price-wrap [display:flex] [align-items:center] [justify-content:flex-end] [gap:2px] [height:32px]">
                              <span className="price-warn [width:16px] [height:16px] [flex-shrink:0] [display:inline-flex] [align-items:center] [justify-content:center]">{item.minWarn ? WARN_ICO : null}</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitPrice.toFixed(2)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => patchCart(item.id, { unitPrice: num(e.target.value) })}
                              />
                            </div>
                            <span className="price-min [position:absolute] [right:0] [top:calc(100%_+_3px)] [font-family:var(--mono)] [font-size:10px] [font-weight:700] [color:#c2410c] [line-height:1.2] [white-space:nowrap] [pointer-events:none]" hidden={!item.minWarn}>
                              Min {money(item.minPrice)}
                            </span>
                          </div>
                        </td>
                        <td className="c-disc [width:88px] [text-align:right]">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.lineDisc.toFixed(2)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const disc = Math.max(0, num(e.target.value));
                              const per = item.qty ? disc / item.qty : 0;
                              patchCart(item.id, {
                                unitPrice: +Math.max(0, item.listPrice - per).toFixed(2),
                              });
                            }}
                          />
                        </td>
                        <td className="c-amt [width:112px] [text-align:right]">
                          <span className="amt [font-family:var(--mono)] [font-weight:700] [font-size:15px] [display:block] [color:#047857]">{money(item.amount)}</span>
                        </td>
                        <td className="c-del [width:48px] [text-align:center]">
                          <button
                            type="button"
                            className="del-btn [border:0] [background:#fef2f2] [color:var(--danger)] [cursor:pointer] [width:32px] [height:32px] [border-radius:6px] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [margin:0_auto]"
                            title="Remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCart((p) => p.filter((x) => x.id !== item.id));
                            }}
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 6h12M8 6V4.5h4V6m-6.5 0 .7 10h7.6l.7-10M8.5 9v5M11.5 9v5" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="cart-empty [display:flex] [flex-direction:column] [align-items:center] [justify-content:center] [height:100%] [min-height:100px] [gap:4px] [color:var(--muted)] [text-align:center] [padding:20px]" hidden={cart.length > 0}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                <p>Scan or search a product</p>
                <small>F3 search · Enter select · ← → unit · Enter qty · Enter add</small>
              </div>
            </div>
          </div>
        </section>

        <aside className="ticket [min-height:0] [overflow:visible] [display:flex] [flex-direction:column] [gap:6px] [padding:8px_10px_8px_4px] [background:#e8edf7]">
          <div className="ticket-head [display:flex] [align-items:center] [justify-content:space-between] [padding:0_2px] [flex-shrink:0] [gap:8px]">
            <div className="invoice-chip [line-height:1.2] [font-size:11px] [color:var(--muted)] [min-width:0]">
              <span>Invoice</span>
              <strong>
                INV-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-{String(invoiceSeq).padStart(4, "0")}
              </strong>
            </div>
            <div className="ticket-tools [display:flex] [align-items:center] [gap:5px] [flex-shrink:0]">
              <button type="button" className="head-btn [height:26px] [padding:0_8px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-size:11px] [font-weight:700] [color:var(--sub)] [display:inline-flex] [align-items:center] [gap:4px]" onClick={() => navigate(routes.dashboard)}>
                Dashboard
              </button>
              <button type="button" className="head-btn [height:26px] [padding:0_8px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-size:11px] [font-weight:700] [color:var(--sub)] [display:inline-flex] [align-items:center] [gap:4px] head-cancel" onClick={cancelBill}>
                Cancel
              </button>
              <span className="clock [font-family:var(--mono)] [font-size:12px] [color:var(--muted)]">{clock}</span>
            </div>
          </div>

          <div className="customer-box [position:relative] [flex-shrink:0] [z-index:22]">
            <div className="customer-chip [display:flex] [align-items:center] [justify-content:space-between] [width:100%] [background:var(--paper)] [border:1px_solid_#a5b4fc] [color:var(--ink)] [border-radius:10px] [padding:8px_12px] [text-align:left] [flex-shrink:0] [box-shadow:var(--shadow)]">
              <svg className="chip-avatar [width:34px] [height:34px] [flex-shrink:0] [margin-right:10px] [padding:7px] [border-radius:50%] [background:var(--accent-bg)] [color:var(--accent)]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM4.2 16.8a5.8 5.8 0 0111.6 0" />
              </svg>
              <div className="chip-left [min-width:0] [flex:1]">
                <span className="chip-kicker [font-size:10px] [letter-spacing:.08em] [text-transform:uppercase] [color:var(--muted)] [font-weight:600] [display:block]">Customer · F2</span>
                <input
                  id="customerSearch"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Search, or type walk-in name / number"
                  value={customer.isWalking ? custQ || guestName : custQ || customer.name}
                  onFocus={() => {
                    setCustOpen(true);
                    setCustHit(0);
                  }}
                  onChange={(e) => {
                    setCustQ(e.target.value);
                    setCustOpen(true);
                    if (customer.isWalking) {
                      const v = e.target.value;
                      if (/^\d[\d\s-]*$/.test(v)) setGuestPhone(v);
                      else setGuestName(v);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCustHit((i) => Math.min(i + 1, custHits.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCustHit((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const c = custHits[custHit];
                      if (c) {
                        setCustomerId(c.id);
                        setCustQ(c.isWalking ? "" : c.name);
                        setCustOpen(false);
                        if (c.isWalking) {
                          setGuestName("");
                          setGuestPhone("");
                        }
                        searchRef.current?.focus();
                      }
                    } else if (e.key === "Escape") {
                      setCustOpen(false);
                    }
                  }}
                  onBlur={() => window.setTimeout(() => setCustOpen(false), 150)}
                />
              </div>
              <span
                className={`chip-balance [font-family:var(--mono)] [font-size:16px] [font-weight:700] [color:var(--muted)] [flex-shrink:0] [margin-left:8px] ${customer.balance < 0 ? "is-due" : customer.balance > 0 ? "is-credit" : ""}`}
              >
                {customer.isWalking
                  ? "Walk-in"
                  : customer.balance < 0
                    ? money(-customer.balance)
                    : customer.balance > 0
                      ? money(customer.balance)
                      : "0.00"}
              </span>
            </div>
            <div className="customer-results [position:absolute] [left:0] [right:0] [top:calc(100%_+_2px)] [background:#fff] [border:1px_solid_var(--line)] [border-radius:8px] [box-shadow:var(--shadow)] [max-height:260px] [overflow:auto] [z-index:30]" hidden={!custOpen}>
              {custHits.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cust-hit ${i === custHit ? "is-active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCustomerId(c.id);
                    setCustQ(c.isWalking ? "" : c.name);
                    setCustOpen(false);
                    if (c.isWalking) {
                      setGuestName("");
                      setGuestPhone("");
                    }
                    searchRef.current?.focus();
                  }}
                >
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.phone || "No phone"}</small>
                  </span>
                  <em className={c.balance < 0 ? "is-due" : c.balance > 0 ? "is-credit" : ""}>
                    {c.balance === 0 ? "—" : money(Math.abs(c.balance))}
                  </em>
                </button>
              ))}
            </div>
          </div>

          <div className="totals-wrap [flex-shrink:0]">
            <div className="totals [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px_10px_0_0] [padding:10px_12px_8px]">
              <div className="t-row [display:flex] [justify-content:space-between] [align-items:center] [min-height:28px] [font-size:13px]">
                <span>Subtotal</span>
                <strong>{money(t.gross)}</strong>
              </div>
              <div className={`t-row [display:flex] [justify-content:space-between] [align-items:center] [min-height:28px] [font-size:13px] t-disc [color:var(--disc)] [font-weight:600] [background:var(--disc-bg)] [margin:4px_-8px] [padding:6px_8px] [border-radius:6px] ${t.lineDisc > 0 ? "is-on" : ""}`}>
                <span>Line discount</span>
                <strong>{money(t.lineDisc)}</strong>
              </div>
              <div className={`t-row [display:flex] [justify-content:space-between] [align-items:center] [min-height:28px] [font-size:13px] t-bill [color:var(--disc)] [font-weight:600] [background:var(--disc-bg)] [margin:4px_-8px] [padding:6px_8px] [border-radius:6px] [border:1px_solid_var(--disc-line)] ${t.billDiscount > 0 ? "is-on" : ""}`}>
                <span>Bill discount</span>
                <div className="disc-wrap [display:flex] [align-items:center] [gap:3px]">
                  <button
                    type="button"
                    className={`disc-mode [height:28px] [min-width:32px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:4px] [cursor:pointer] [font-size:11px] [font-weight:700] [color:var(--sub)] ${discMode === "rs" ? "is-active" : ""}`}
                    onClick={() => setDiscMode("rs")}
                  >
                    Rs
                  </button>
                  <button
                    type="button"
                    className={`disc-mode [height:28px] [min-width:32px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:4px] [cursor:pointer] [font-size:11px] [font-weight:700] [color:var(--sub)] ${discMode === "pct" ? "is-active" : ""}`}
                    onClick={() => setDiscMode("pct")}
                  >
                    %
                  </button>
                  <input
                    id="billDiscount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={discMode === "pct" ? discPct : billDiscount}
                    onChange={(e) => {
                      const v = Math.max(0, num(e.target.value));
                      if (discMode === "pct") setDiscPct(Math.min(100, v));
                      else setBillDiscount(v);
                      setRoundTarget(0);
                    }}
                  />
                </div>
              </div>
              <div className="round-row [display:flex] [gap:4px] [margin:6px_0_2px]">
                {[0, 10, 50, 100, 500, 1000].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`${r === 0 ? "round-clear" : ""} ${roundTarget === r ? "is-active" : ""}`}
                    onClick={() => applyRound(r)}
                  >
                    {r === 0 ? "×" : `R${r}`}
                  </button>
                ))}
              </div>
              <div
                className={`t-row [display:flex] [justify-content:space-between] [align-items:center] [min-height:28px] [font-size:13px] t-prev [margin-top:6px] [padding-top:6px] [border-top:1px_dashed_var(--line)] [font-weight:600] ${customer.balance < 0 ? "is-due" : customer.balance > 0 ? "is-credit" : ""}`}
              >
                <span>Previous balance</span>
                <strong>
                  {customer.isWalking
                    ? "Walk-in"
                    : customer.balance < 0
                      ? `Due ${money(-customer.balance)}`
                      : customer.balance > 0
                        ? `Cr ${money(customer.balance)}`
                        : money(0)}
                </strong>
              </div>
            </div>
            <div className="grand [display:flex] [justify-content:space-between] [align-items:baseline] [background:linear-gradient(90deg,_#0f172a,_#065f46)] [color:#fff] [padding:10px_12px]">
              <span>TOTAL</span>
              <strong>{money(t.total)}</strong>
            </div>
            <div
              className={`after-bal ${
                customer.isWalking
                  ? "is-walk"
                  : balanceAfter < 0
                    ? "is-due"
                    : balanceAfter > 0
                      ? "is-credit"
                      : ""
              }`}
            >
              <span>
                {customer.isWalking
                  ? "Pay in full"
                  : balanceAfter < 0
                    ? "Due after bill"
                    : balanceAfter > 0
                      ? "Credit after bill"
                      : "Settled after bill"}
              </span>
              <strong>
                {customer.isWalking ? money(t.total) : money(Math.abs(balanceAfter))}
              </strong>
            </div>
          </div>

          <div className="pay-block [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [padding:8px_10px] [flex:1] [min-height:0] [overflow:auto]">
            <div className="pay-tabs [display:grid] [grid-template-columns:1fr_1fr_1fr] [gap:4px] [margin-bottom:8px]">
              <button
                type="button"
                className={`pay-tab [height:34px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:6px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:5px] ${payMethod === "cash" ? "is-active" : ""}`}
                data-pay="cash"
                onClick={() => setPay("cash")}
              >
                Cash
              </button>
              <button
                type="button"
                className={`pay-tab [height:34px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:6px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:5px] ${payMethod === "online" ? "is-active" : ""}`}
                data-pay="online"
                onClick={() => setPay("online")}
              >
                Online
              </button>
              <button
                type="button"
                className={`pay-tab [height:34px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:6px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:5px] ${payMethod === "split" ? "is-active" : ""}`}
                data-pay="split"
                onClick={() => setPay("split")}
              >
                Split
              </button>
            </div>
            <div className="pay-fields">
              {(payMethod === "cash" || payMethod === "online") && (
                <div className="cash-notes [display:flex] [gap:4px] [margin-bottom:6px]">
                  <button type="button" onClick={applyExact}>
                    Exact · F7
                  </button>
                  {[500, 1000, 5000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        if (payMethod === "cash") setReceived((v) => v + n);
                        else setOnlineAmt((v) => v + n);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {payMethod === "cash" && (
                <>
                  <div className="field [display:grid] [gap:6px]">
                    <label>Cash received</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={received}
                      onChange={(e) => setReceived(num(e.target.value))}
                    />
                  </div>
                  <div className={`tender-box [display:flex] [justify-content:space-between] [align-items:baseline] [padding:8px_10px] [border-radius:6px] [margin-bottom:4px] is-${unpaid > 0.001 ? "bad" : "ok"}`}>
                    <span className="tender-label">{unpaid > 0.001 ? "Due" : extra > 0.001 ? (returnChange ? "Change" : "To balance") : "Paid"}</span>
                    <strong className="tender-val">{money(unpaid > 0.001 ? unpaid : extra > 0.001 ? extra : received)}</strong>
                  </div>
                  {!customer.isWalking && extra >= 0.01 && (
                    <div className="extra-choice [display:grid] [grid-template-columns:1fr_1fr] [gap:4px] [margin-bottom:6px]">
                      <button
                        type="button"
                        className={!returnChange ? "is-active" : ""}
                        onClick={() => setReturnChange(false)}
                      >
                        Add to balance
                      </button>
                      <button
                        type="button"
                        className={returnChange ? "is-active" : ""}
                        onClick={() => setReturnChange(true)}
                      >
                        Return change
                      </button>
                    </div>
                  )}
                </>
              )}
              {payMethod === "online" && (
                <>
                  <div className="field [display:grid] [gap:6px]">
                    <label>Bank / wallet</label>
                    <select value={bank} onChange={(e) => setBank(e.target.value)}>
                      {BANKS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field [display:grid] [gap:6px]">
                    <label>Online received</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={onlineAmt}
                      onChange={(e) => setOnlineAmt(num(e.target.value))}
                    />
                  </div>
                  <div className={`tender-box [display:flex] [justify-content:space-between] [align-items:baseline] [padding:8px_10px] [border-radius:6px] [margin-bottom:4px] is-${unpaid > 0.001 ? "bad" : "ok"}`}>
                    <span className="tender-label">{unpaid > 0.001 ? "Due" : "Paid"}</span>
                    <strong className="tender-val">{money(unpaid > 0.001 ? unpaid : onlineAmt)}</strong>
                  </div>
                </>
              )}
              {payMethod === "split" && (
                <>
                  <div className="pay-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:5px]">
                    <div className="field [display:grid] [gap:6px]">
                      <label>Cash</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cashAmt}
                        onChange={(e) => setCashAmt(num(e.target.value))}
                      />
                    </div>
                    <div className="field [display:grid] [gap:6px]">
                      <label>Online</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={onlineAmt}
                        onChange={(e) => setOnlineAmt(num(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className={`pay-remaining [display:flex] [justify-content:space-between] [align-items:center] [padding:7px_10px] [border-radius:6px] [font-size:12px] [font-weight:700] [margin-bottom:6px] ${Math.abs(unpaid) < 0.01 ? "ok" : "bad"}`}>
                    <span>Remaining</span>
                    <strong>{money(unpaid)}</strong>
                  </div>
                </>
              )}
            </div>
            <div className={`pay-status [font-size:12px] [min-height:18px] [color:var(--muted)] ${paymentOk ? "ok" : "bad"}`}>
              {cart.length === 0 ? "" : paymentOk ? "Ready to complete" : customer.isWalking ? "Pay in full required" : "Partial ok for account"}
            </div>
          </div>

          <div className="note-row [flex-shrink:0]">
            <input
              type="text"
              placeholder="Sale note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="actions [display:grid] [grid-template-columns:1fr_1fr] [gap:4px] [flex-shrink:0]">
            <button type="button" className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-hold" onClick={holdInvoice}>
              Hold · F4{" "}
              {holds.length > 0 ? <span className="hold-badge [display:inline-block] [background:var(--hold)] [color:#fff] [font-size:10px] [min-width:16px] [padding:0_5px] [border-radius:99px] [margin-left:2px]">{holds.length}</span> : null}
            </button>
            <button
              type="button"
              className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-recent"
              onClick={(e) => {
                e.stopPropagation();
                setBillsTip((v) => !v);
              }}
            >
              Recent
            </button>
            <div className="print-row">
              <button
                type="button"
                className={`btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-print-cut ${splitPrint ? "is-active" : ""}`}
                onClick={() => {
                  setSplitPrint((v) => !v);
                  showToast(!splitPrint ? "Split print on" : "Split print off");
                }}
              >
                Split · F10
              </button>
              <button
                type="button"
                className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-print-ur"
                onClick={() => {
                  if (cart.length) setPrintOpen(true);
                  else showToast("Nothing to print");
                }}
              >
                پرنٹ اردو
              </button>
              <button
                type="button"
                className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-print"
                onClick={() => {
                  if (cart.length) setPrintOpen(true);
                  else showToast("Nothing to print");
                }}
              >
                Print · F9
              </button>
            </div>
            <button
              type="button"
              className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-preview"
              onClick={() => {
                if (cart.length) setPrintOpen(true);
                else showToast("Nothing to preview");
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="btn [height:36px] [border:1px_solid_var(--line)] [background:#fff] [border-radius:5px] [cursor:pointer] [font-weight:600] [font-size:12px] [color:var(--sub)] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] btn-wa"
              disabled={!displayCustomer.phone}
              onClick={() => {
                if (!displayCustomer.phone) {
                  showToast("No phone on this customer");
                  return;
                }
                if (!cart.length) {
                  showToast("Nothing to send");
                  return;
                }
                const text = encodeURIComponent(
                  `*${settings.shopName}*\nTotal: ${money(t.total)}\nThank you`,
                );
                window.open(`https://wa.me/${displayCustomer.phone.replace(/\D/g, "")}?text=${text}`, "_blank");
              }}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className="btn-sale [grid-column:1_/_-1] [height:48px] [border:0] [background:var(--sale)] [color:#fff] [border-radius:6px] [font-size:16px] [font-weight:700] [cursor:pointer] [transition:background_.1s] [display:inline-flex] [align-items:center] [justify-content:center] [gap:8px]"
              disabled={!cart.length || !paymentOk}
              onClick={completeSale}
            >
              Complete Sale · F12
            </button>
          </div>
        </aside>
      </main>

      <footer className="fnbar [grid-column:2] [grid-row:2] [display:grid] [grid-template-columns:repeat(12,_1fr)] [background:var(--header)] [color:#94a3b8] [overflow:hidden]">
        {(
          [
            ["F1", "Help"],
            ["F2", "Customer"],
            ["F3", "Search"],
            ["F4", "Hold"],
            ["F5", "Cancel"],
            ["F6", "Cart"],
            ["F7", "Exact"],
            ["F8", "Discount"],
            ["F9", "Print"],
            ["F10", "Split"],
            ["F11", "W / R"],
            ["F12", "Sale"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-fn={k}
            className={k === "F10" && splitPrint ? "is-on" : undefined}
            onClick={() => fnRef.current[k]?.()}
          >
            <kbd>{k}</kbd>
            <span>{label}</span>
          </button>
        ))}
      </footer>

      <div className="bills-tip [position:fixed] [z-index:36] [min-width:220px] [padding:6px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_10px_28px_rgba(15,23,42,.18)] [display:grid] [gap:4px]" id="billsTip" hidden={!billsTip} style={{ right: 16, bottom: 52 }}>
        <button
          type="button"
          onClick={() => {
            setBillsTip(false);
            setHoldsOpen(true);
          }}
        >
          <span>Held invoices</span>
          <em>{holds.length}</em>
        </button>
        <button
          type="button"
          onClick={() => {
            setBillsTip(false);
            setRecentOpen(true);
          }}
        >
          <span>Recent invoices</span>
        </button>
      </div>

      <div className="modal [position:fixed] [inset:0] [background:rgba(15,23,42,.5)] [display:none] [place-items:center] [z-index:40] [padding:16px] [backdrop-filter:blur(3px)]" hidden={!holdsOpen && !recentOpen && !askSupplier} onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("modal")) {
          setHoldsOpen(false);
          setRecentOpen(false);
          setAskSupplier(false);
        }
      }}>
        <div className="modal-card [width:min(580px,_100%)] [max-height:min(78dvh,_560px)] [overflow:auto] [background:var(--paper)] [border-radius:10px] [box-shadow:0_20px_40px_rgba(0,0,0,.2)] [padding:14px]">
          {holdsOpen ? (
            <>
              <div className="modal-head [display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:8px]">
                <h2>Held invoices</h2>
                <button type="button" className="close-x [border:0] [background:#f1f5f9] [font-size:16px] [cursor:pointer] [color:var(--muted)] [width:28px] [height:28px] [border-radius:6px] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center]" onClick={() => setHoldsOpen(false)}>
                  ×
                </button>
              </div>
              {!holds.length ? (
                <div className="nav-empty [padding:24px_8px] [text-align:center] [color:var(--muted)] [font-size:13px]">No held invoices.</div>
              ) : (
                holds.map((h) => (
                  <div
                    key={h.id}
                    className="list-row [display:grid] [grid-template-columns:1fr_auto] [gap:8px] [padding:7px_6px] [border-bottom:1px_solid_#f1f5f9] [cursor:pointer] [align-items:center] [border-radius:5px] [transition:background_.08s]"
                    onClick={() => {
                      // restore simplified from held lines
                      const restored: CartLine[] = h.lines.map((l) => {
                        const p = products.find((x) => x.id === l.productId);
                        return recompute({
                          id: uid(),
                          productId: l.productId,
                          name: l.name,
                          sku: p?.sku || "",
                          baseUnit: l.unit,
                          sellUnit: l.unit,
                          packSize: 1,
                          priceMode: "retail",
                          minPrice: l.minFloor,
                          listPrice: l.price,
                          unitPrice: l.price,
                          qty: l.qty,
                          baseQty: l.qty,
                          lineDisc: 0,
                          amount: 0,
                          lotsNote: l.lotsNote,
                          minWarn: false,
                        });
                      });
                      setCart(restored);
                      setCustomerId(h.customerId);
                      setHolds((p) => p.filter((x) => x.id !== h.id));
                      setHoldsOpen(false);
                      showToast("Held invoice restored");
                    }}
                  >
                    <div>
                      <strong>{h.label}</strong>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{h.at}</div>
                    </div>
                    <span className="bal">
                      {money(h.lines.reduce((s, l) => s + l.qty * l.price, 0))}
                    </span>
                  </div>
                ))
              )}
            </>
          ) : null}
          {recentOpen ? (
            <>
              <div className="modal-head [display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:8px]">
                <h2>Recent invoices</h2>
                <button type="button" className="close-x [border:0] [background:#f1f5f9] [font-size:16px] [cursor:pointer] [color:var(--muted)] [width:28px] [height:28px] [border-radius:6px] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center]" onClick={() => setRecentOpen(false)}>
                  ×
                </button>
              </div>
              {!invoices.length ? (
                <div className="nav-empty [padding:24px_8px] [text-align:center] [color:var(--muted)] [font-size:13px]">No recent invoices</div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.no} className="list-row [display:grid] [grid-template-columns:1fr_auto] [gap:8px] [padding:7px_6px] [border-bottom:1px_solid_#f1f5f9] [cursor:pointer] [align-items:center] [border-radius:5px] [transition:background_.08s]">
                    <div>
                      <strong>{inv.no}</strong>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {inv.customer} · {inv.at}
                      </div>
                    </div>
                    <span className="bal">{money(inv.total)}</span>
                  </div>
                ))
              )}
            </>
          ) : null}
          {askSupplier ? (
            <>
              <div className="modal-head [display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:8px]">
                <h2>Pick supplier</h2>
                <button type="button" className="close-x [border:0] [background:#f1f5f9] [font-size:16px] [cursor:pointer] [color:var(--muted)] [width:28px] [height:28px] [border-radius:6px] [transition:all_.1s] [display:inline-flex] [align-items:center] [justify-content:center]" onClick={() => setAskSupplier(false)}>
                  ×
                </button>
              </div>
              <p>Settings require choosing a supplier for this sale.</p>
              <div className="modal-actions [display:flex] [justify-content:flex-end] [gap:6px] [margin-top:12px]">
                <button type="button" className="btn-ghost [border:1px_solid_var(--line)] [background:#fff] [color:var(--sub)]" onClick={() => setAskSupplier(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary [border:0] [background:var(--sale)] [color:#fff]"
                  onClick={() => addPendingToCart("s1")}
                >
                  Use first supplier
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="toast [position:fixed] [bottom:48px] [left:50%] [transform:translateX(-50%)] [background:var(--ink)] [color:#fff] [padding:7px_14px] [border-radius:6px] [z-index:50] [font-size:13px] [font-weight:500] [box-shadow:0_8px_20px_rgba(0,0,0,.2)]" hidden={!toast}>
        {toast}
      </div>

      <PrintPreview
        open={printOpen}
        onClose={() => {
          setPrintOpen(false);
          if (clearAfterPrint) {
            setClearAfterPrint(false);
            newBill(true);
          }
        }}
        customer={displayCustomer}
        lines={invoiceLines}
        total={t.total}
        paid={amountPaid}
        balanceBefore={customer.balance}
        balanceAfter={balanceAfter}
        duplicate={false}
      />
    </>
  );
}
