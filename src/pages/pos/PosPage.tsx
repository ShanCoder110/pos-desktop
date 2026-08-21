import { useEffect, useMemo, useRef, useState } from "react";
import { PrintPreview } from "@/components/print/PrintPreview";
import { useDebounce } from "@/hooks/useDebounce";
import { customers as seedCustomers, heldBills, products as seedProducts } from "@/shared/mock";
import { useSettings } from "@/shared/settings";
import type { Customer, HeldBill, InvoiceLine, Product } from "@/shared/types";
import { moneyNum } from "@/utils/format";
import { consumeLots, remainingStock as lotStock } from "@/utils/lots";

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
  <svg className="warn-ico" viewBox="0 0 20 20" aria-hidden="true">
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
  return p.isLinear && p.packQty && p.packQty > 1 ? p.packQty : 0;
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
  const { settings } = useSettings();
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

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
  const [customerId, setCustomerId] = useState("c0");
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
  const [holds, setHolds] = useState<HeldBill[]>(heldBills);
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

  const customer = seedCustomers.find((c) => c.id === customerId) ?? seedCustomers[0];
  const displayCustomer: Customer = customer.isWalking
    ? {
        ...customer,
        name: guestName.trim() || (guestPhone ? guestPhone : "Walking Customer"),
        phone: guestPhone,
      }
    : customer;

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return seedProducts.slice(0, 12);
    return seedProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }, [debounced]);

  useEffect(() => {
    setHit(0);
  }, [debounced]);

  const custHits = useMemo(() => {
    const q = custQ.trim().toLowerCase();
    if (!q) return seedCustomers;
    return seedCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [custQ]);

  function cartStock(productId: string, exceptId?: string) {
    const held = cart
      .filter((x) => x.productId === productId && x.id !== exceptId)
      .reduce((s, x) => s + x.baseQty, 0);
    const base = lotStock(productId) || seedProducts.find((p) => p.id === productId)?.stock || 0;
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

  function selectProduct(product: Product) {
    if ((lotStock(product.id) || product.stock) <= 0) {
      showToast("Out of stock");
      return;
    }
    setPending(product);
    setSellUnit("base");
    setQuery(product.name);
    setMenuOpen(false);
    setQtyInput("1");
    window.setTimeout(() => {
      if (packOf(product)) {
        // unit bar focus first for packable
      }
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 0);
  }

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
        const p = seedProducts.find((x) => x.id === item.productId);
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
        const p = seedProducts.find((x) => x.id === item.productId);
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
        const p = seedProducts.find((x) => x.id === item.productId);
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
    const onKey = (e: KeyboardEvent) => {
      if (/^F([1-9]|1[0-2])$/.test(e.key)) e.preventDefault();
      if (e.key === "F1") showToast("F2 customer · F3 search · F4 hold · F12 sale");
      if (e.key === "F2") {
        setCustOpen(true);
        document.getElementById("customerSearch")?.focus();
      }
      if (e.key === "F3") searchRef.current?.focus();
      if (e.key === "F4") holdInvoice();
      if (e.key === "F5") cancelBill();
      if (e.key === "F7") applyExact();
      if (e.key === "F8") document.getElementById("billDiscount")?.focus();
      if (e.key === "F9") {
        if (cart.length) setPrintOpen(true);
        else showToast("Nothing to print");
      }
      if (e.key === "F10") {
        setSplitPrint((v) => !v);
        showToast(!splitPrint ? "Split print on" : "Split print off");
      }
      if (e.key === "F11") switchAllCart();
      if (e.key === "F12") completeSale();
      if (e.key === "Escape") {
        setMenuOpen(false);
        setCustOpen(false);
        setBillsTip(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, pending, query, hit, results, splitPrint, payMethod, t.total, customerId]);

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
      <main className="workspace">
        <section className="stage">
          <div className="search-row">
            <div className="search-wrap">
              <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
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
              <div className="search-results" hidden={!menuOpen || !results.length}>
                {results.map((p, i) => {
                  const left = cartStock(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`search-hit ${i === hit ? "is-active" : ""} ${left < 10 ? "is-low" : ""}`}
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

            <button type="button" className="cat-btn" onClick={() => showToast("Categories coming next")}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3.5 6.5h5l1.2 1.5H16.5v7.5H3.5V6.5z" />
                <path d="M3.5 6.5V5.2A1.2 1.2 0 014.7 4h3.1l1.2 1.5" />
              </svg>
              <span>Categories</span>
              <kbd>⇧F3</kbd>
            </button>

            <div className="price-mode" role="group" aria-label="Price mode">
              <button
                type="button"
                className={`mode-btn ${priceMode === "retail" ? "is-active" : ""}`}
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
                className={`mode-btn ${priceMode === "wholesale" ? "is-active" : ""}`}
                onClick={() => {
                  setPriceMode("wholesale");
                  showToast("Add as wholesale");
                }}
              >
                Wholesale
              </button>
            </div>

            <div className="unit-box" hidden={!pending}>
              <span className="qty-label">
                UNIT <kbd>← →</kbd>
              </span>
              <div className="unit-toggles">
                {pending ? (
                  <>
                    <button
                      type="button"
                      className={`unit-tog ${sellUnit === "base" ? "is-active" : ""}`}
                      disabled={!packOf(pending)}
                      onClick={() => setSellUnit("base")}
                    >
                      {prettyUnit(pending.unit)}
                    </button>
                    {packOf(pending) ? (
                      <button
                        type="button"
                        className={`unit-tog ${sellUnit === "pack" ? "is-active" : ""}`}
                        onClick={() => setSellUnit("pack")}
                      >
                        Pack of {packOf(pending)}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className="qty-box">
              <span className="qty-label">
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
                  }
                }}
              />
              <span className={`qty-hint ${qtyHint?.cls || ""}`} hidden={!qtyHint}>
                {qtyHint?.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </div>

            <button type="button" className="btn-add" id="btnAdd" onClick={() => addPendingToCart()}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add ↵
            </button>
          </div>

          <div className="cart-panel">
            <div className="cart-head">
              <span className="cart-head-left">
                Cart <span className="cart-badge">{cart.length}</span>
                <span className="cart-all-mode" role="group">
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
              <div className="cart-head-right">
                <span className="today-stats">
                  <span>Today {invoices.length} bills</span>
                  <span id="todayCash">Cash {money(invoices.reduce((s, i) => s + i.total, 0))}</span>
                </span>
                <button type="button" className="cart-clear" onClick={clearCart}>
                  Clear
                </button>
              </div>
            </div>
            <div className="cart-scroll">
              <table className="cart-table">
                <thead>
                  <tr>
                    <th className="c-hash">#</th>
                    <th className="c-item">Item</th>
                    <th className="c-stock">Stock</th>
                    <th className="c-qty">Qty</th>
                    <th className="c-price">Price</th>
                    <th className="c-disc">Disc</th>
                    <th className="c-amt">Amount</th>
                    <th className="c-del" />
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
                        <td className="c-hash">{i + 1}</td>
                        <td className="c-item">
                          <span className="item-name">
                            <span className="name-text">{item.name}</span>
                          </span>
                          <span className="item-sku">
                            {item.sku} · {qtyStr(item.qty)} {prettyUnit(item.sellUnit)}
                            {isPack ? ` = ${qtyStr(item.baseQty)} ${prettyUnit(item.baseUnit)}` : ""}
                          </span>
                          {packN ? (
                            <span className="line-units">
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
                            <span className="unit-badge">{prettyUnit(item.sellUnit)}</span>
                          )}
                          <span className="line-units line-price">
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
                        <td className="c-stock">
                          <span className={`stock-val ${left < 10 ? "is-low" : ""}`}>
                            {left < 10 ? WARN_ICO : null}
                            <span className="stock-num">
                              {qtyStr(left)} {prettyUnit(item.baseUnit)}
                            </span>
                          </span>
                        </td>
                        <td className="c-qty">
                          <div className="qty-step">
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
                        <td className={`c-price ${item.minWarn ? "is-min" : ""}`}>
                          <div className="price-cell">
                            <div className="price-wrap">
                              <span className="price-warn">{item.minWarn ? WARN_ICO : null}</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitPrice.toFixed(2)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => patchCart(item.id, { unitPrice: num(e.target.value) })}
                              />
                            </div>
                            <span className="price-min" hidden={!item.minWarn}>
                              Min {money(item.minPrice)}
                            </span>
                          </div>
                        </td>
                        <td className="c-disc">
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
                        <td className="c-amt">
                          <span className="amt">{money(item.amount)}</span>
                        </td>
                        <td className="c-del">
                          <button
                            type="button"
                            className="del-btn"
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
              <div className="cart-empty" hidden={cart.length > 0}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                <p>Scan or search a product</p>
                <small>F3 search · Enter select · ← → unit · Enter qty · Enter add</small>
              </div>
            </div>
          </div>
        </section>

        <aside className="ticket">
          <div className="ticket-head">
            <div className="invoice-chip">
              <span>Invoice</span>
              <strong>
                INV-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-{String(invoiceSeq).padStart(4, "0")}
              </strong>
            </div>
            <div className="ticket-tools">
              <button type="button" className="head-btn head-cancel" onClick={cancelBill}>
                Cancel
              </button>
              <span className="clock">{clock}</span>
            </div>
          </div>

          <div className="customer-box">
            <div className="customer-chip">
              <svg className="chip-avatar" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM4.2 16.8a5.8 5.8 0 0111.6 0" />
              </svg>
              <div className="chip-left">
                <span className="chip-kicker">Customer · F2</span>
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
                className={`chip-balance ${customer.balance < 0 ? "is-due" : customer.balance > 0 ? "is-credit" : ""}`}
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
            <div className="customer-results" hidden={!custOpen}>
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

          <div className="totals-wrap">
            <div className="totals">
              <div className="t-row">
                <span>Subtotal</span>
                <strong>{money(t.gross)}</strong>
              </div>
              <div className={`t-row t-disc ${t.lineDisc > 0 ? "is-on" : ""}`}>
                <span>Line discount</span>
                <strong>{money(t.lineDisc)}</strong>
              </div>
              <div className={`t-row t-bill ${t.billDiscount > 0 ? "is-on" : ""}`}>
                <span>Bill discount</span>
                <div className="disc-wrap">
                  <button
                    type="button"
                    className={`disc-mode ${discMode === "rs" ? "is-active" : ""}`}
                    onClick={() => setDiscMode("rs")}
                  >
                    Rs
                  </button>
                  <button
                    type="button"
                    className={`disc-mode ${discMode === "pct" ? "is-active" : ""}`}
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
              <div className="round-row">
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
                className={`t-row t-prev ${customer.balance < 0 ? "is-due" : customer.balance > 0 ? "is-credit" : ""}`}
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
            <div className="grand">
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

          <div className="pay-block">
            <div className="pay-tabs">
              <button
                type="button"
                className={`pay-tab ${payMethod === "cash" ? "is-active" : ""}`}
                data-pay="cash"
                onClick={() => setPay("cash")}
              >
                Cash
              </button>
              <button
                type="button"
                className={`pay-tab ${payMethod === "online" ? "is-active" : ""}`}
                data-pay="online"
                onClick={() => setPay("online")}
              >
                Online
              </button>
              <button
                type="button"
                className={`pay-tab ${payMethod === "split" ? "is-active" : ""}`}
                data-pay="split"
                onClick={() => setPay("split")}
              >
                Split
              </button>
            </div>
            <div className="pay-fields">
              {(payMethod === "cash" || payMethod === "online") && (
                <div className="cash-notes">
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
                  <div className="field">
                    <label>Cash received</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={received}
                      onChange={(e) => setReceived(num(e.target.value))}
                    />
                  </div>
                  <div className={`tender-box is-${unpaid > 0.001 ? "bad" : "ok"}`}>
                    <span className="tender-label">{unpaid > 0.001 ? "Due" : extra > 0.001 ? (returnChange ? "Change" : "To balance") : "Paid"}</span>
                    <strong className="tender-val">{money(unpaid > 0.001 ? unpaid : extra > 0.001 ? extra : received)}</strong>
                  </div>
                  {!customer.isWalking && extra >= 0.01 && (
                    <div className="extra-choice">
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
                  <div className="field">
                    <label>Bank / wallet</label>
                    <select value={bank} onChange={(e) => setBank(e.target.value)}>
                      {BANKS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Online received</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={onlineAmt}
                      onChange={(e) => setOnlineAmt(num(e.target.value))}
                    />
                  </div>
                  <div className={`tender-box is-${unpaid > 0.001 ? "bad" : "ok"}`}>
                    <span className="tender-label">{unpaid > 0.001 ? "Due" : "Paid"}</span>
                    <strong className="tender-val">{money(unpaid > 0.001 ? unpaid : onlineAmt)}</strong>
                  </div>
                </>
              )}
              {payMethod === "split" && (
                <>
                  <div className="pay-grid">
                    <div className="field">
                      <label>Cash</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cashAmt}
                        onChange={(e) => setCashAmt(num(e.target.value))}
                      />
                    </div>
                    <div className="field">
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
                  <div className={`pay-remaining ${Math.abs(unpaid) < 0.01 ? "ok" : "bad"}`}>
                    <span>Remaining</span>
                    <strong>{money(unpaid)}</strong>
                  </div>
                </>
              )}
            </div>
            <div className={`pay-status ${paymentOk ? "ok" : "bad"}`}>
              {cart.length === 0 ? "" : paymentOk ? "Ready to complete" : customer.isWalking ? "Pay in full required" : "Partial ok for account"}
            </div>
          </div>

          <div className="note-row">
            <input
              type="text"
              placeholder="Sale note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="actions">
            <button type="button" className="btn btn-hold" onClick={holdInvoice}>
              Hold · F4{" "}
              {holds.length > 0 ? <span className="hold-badge">{holds.length}</span> : null}
            </button>
            <button
              type="button"
              className="btn btn-recent"
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
                className={`btn btn-print-cut ${splitPrint ? "is-active" : ""}`}
                onClick={() => {
                  setSplitPrint((v) => !v);
                  showToast(!splitPrint ? "Split print on" : "Split print off");
                }}
              >
                Split · F10
              </button>
              <button
                type="button"
                className="btn btn-print-ur"
                onClick={() => {
                  if (cart.length) setPrintOpen(true);
                  else showToast("Nothing to print");
                }}
              >
                پرنٹ اردو
              </button>
              <button
                type="button"
                className="btn btn-print"
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
              className="btn btn-preview"
              onClick={() => {
                if (cart.length) setPrintOpen(true);
                else showToast("Nothing to preview");
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="btn btn-wa"
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
              className="btn-sale"
              disabled={!cart.length || !paymentOk}
              onClick={completeSale}
            >
              Complete Sale · F12
            </button>
          </div>
        </aside>
      </main>

      <footer className="fnbar">
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
            onClick={() => {
              const map: Record<string, () => void> = {
                F1: () => showToast("F2 customer · F3 search · F4 hold · F12 sale"),
                F2: () => {
                  setCustOpen(true);
                  document.getElementById("customerSearch")?.focus();
                },
                F3: () => searchRef.current?.focus(),
                F4: holdInvoice,
                F5: cancelBill,
                F6: () => showToast("Select a cart row to edit qty"),
                F7: applyExact,
                F8: () => document.getElementById("billDiscount")?.focus(),
                F9: () => (cart.length ? setPrintOpen(true) : showToast("Nothing to print")),
                F10: () => {
                  setSplitPrint((v) => !v);
                  showToast(!splitPrint ? "Split print on" : "Split print off");
                },
                F11: () => switchAllCart(),
                F12: completeSale,
              };
              map[k]?.();
            }}
          >
            <kbd>{k}</kbd>
            <span>{label}</span>
          </button>
        ))}
      </footer>

      <div className="bills-tip" id="billsTip" hidden={!billsTip} style={{ right: 16, bottom: 52 }}>
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

      <div className="modal" hidden={!holdsOpen && !recentOpen && !askSupplier} onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("modal")) {
          setHoldsOpen(false);
          setRecentOpen(false);
          setAskSupplier(false);
        }
      }}>
        <div className="modal-card">
          {holdsOpen ? (
            <>
              <div className="modal-head">
                <h2>Held invoices</h2>
                <button type="button" className="close-x" onClick={() => setHoldsOpen(false)}>
                  ×
                </button>
              </div>
              {!holds.length ? (
                <div className="nav-empty">No held invoices.</div>
              ) : (
                holds.map((h) => (
                  <div
                    key={h.id}
                    className="list-row"
                    onClick={() => {
                      // restore simplified from held lines
                      const restored: CartLine[] = h.lines.map((l) => {
                        const p = seedProducts.find((x) => x.id === l.productId);
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
              <div className="modal-head">
                <h2>Recent invoices</h2>
                <button type="button" className="close-x" onClick={() => setRecentOpen(false)}>
                  ×
                </button>
              </div>
              {!invoices.length ? (
                <div className="nav-empty">No recent invoices</div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.no} className="list-row">
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
              <div className="modal-head">
                <h2>Pick supplier</h2>
                <button type="button" className="close-x" onClick={() => setAskSupplier(false)}>
                  ×
                </button>
              </div>
              <p>Settings require choosing a supplier for this sale.</p>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setAskSupplier(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => addPendingToCart("s1")}
                >
                  Use first supplier
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="toast" hidden={!toast}>
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
