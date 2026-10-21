import type { KeyboardEvent, RefObject } from "react";
import { CmwrPriceTip, type CmwrPrices } from "@/components/common/CmwrPriceTip";
import type { Product } from "@/shared/types";

export type PosSearchResult = {
  product: Product;
  unitLabel: string;
  availableLabel: string;
  priceLabel: string;
  /** Cost · Min · Wholesale · Retail — shown on product-name hover. */
  tierPrices?: CmwrPrices;
  stockTitle: string;
  low: boolean;
  out: boolean;
};

export type PosCategoryChoice = { id: string; name: string; count: number };

export function PosProductSearch({
  rootRef,
  inputRef,
  query,
  open,
  browse,
  categories,
  productTotalCount,
  categoryPickerOpen,
  selectedCategory,
  results,
  activeIndex,
  selected,
  panelHeight,
  onQuery,
  onFocus,
  onClick,
  onActiveIndex,
  onSelect,
  onCategorySelect,
  onShowCategories,
  onClearCategory,
  onEnter,
  onClose,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  open: boolean;
  browse: boolean;
  categories: PosCategoryChoice[];
  /** Total products for the All row (unfiltered catalog). */
  productTotalCount: number;
  categoryPickerOpen: boolean;
  selectedCategory?: { id: string; name: string };
  results: PosSearchResult[];
  activeIndex: number;
  selected?: { unit: string; price: string };
  panelHeight: number;
  onQuery: (value: string) => void;
  onFocus: () => void;
  onClick: () => void;
  onActiveIndex: (index: number) => void;
  onSelect: (product: Product) => void;
  onCategorySelect: (categoryId: string) => void;
  onShowCategories: () => void;
  onClearCategory: () => void;
  onEnter: () => void;
  onClose: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Category picker: index 0 = All, then categories.
    const optionCount = categoryPickerOpen ? categories.length + 1 : results.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onActiveIndex(Math.min(activeIndex + 1, Math.max(0, optionCount - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (categoryPickerOpen) {
        if (activeIndex <= 0) onClearCategory();
        else {
          const category = categories[activeIndex - 1];
          if (category) onCategorySelect(category.id);
        }
      } else onEnter();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div ref={rootRef} className="search-wrap relative min-w-0 flex-1">
      <svg
        className="search-icon pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--search)]"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input
        ref={inputRef}
        id="productSearch"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          selectedCategory
            ? `Search in ${selectedCategory.name} — F3`
            : categoryPickerOpen
              ? "Search categories"
              : "Search ID, name, SKU or barcode — F3"
        }
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
      {selected ? (
        <span className="pos-search-selection" aria-live="polite">
          <small>{selected.unit}</small>
          <strong>Rs {selected.price}</strong>
        </span>
      ) : null}
      <div
        className="search-results absolute left-0 right-0 top-[calc(100%+2px)] z-20 overflow-x-hidden overflow-y-auto rounded-lg border border-line bg-paper shadow-[var(--shadow)] [scrollbar-width:none]"
        style={{ maxHeight: 380, height: panelHeight }}
        hidden={!open || Boolean(selected)}
      >
        {categoryPickerOpen ? (
          <>
            <div className="search-head flex items-center justify-between">
              <span>Choose category</span>
            </div>
            <div className="pos-category-results">
              <button
                type="button"
                className={`pos-category-hit ${activeIndex === 0 ? "is-active" : ""} ${!selectedCategory ? "is-current" : ""}`}
                onMouseEnter={() => onActiveIndex(0)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onClearCategory();
                }}
              >
                <span>All</span>
                <small>{productTotalCount} products</small>
              </button>
              {categories.map((category, index) => {
                const rowIndex = index + 1;
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={`pos-category-hit ${rowIndex === activeIndex ? "is-active" : ""} ${category.id === selectedCategory?.id ? "is-current" : ""}`}
                    onMouseEnter={() => onActiveIndex(rowIndex)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onCategorySelect(category.id);
                    }}
                  >
                    <span>{category.name}</span>
                    <small>{category.count} products</small>
                  </button>
                );
              })}
              {!categories.length ? (
                <div className="pos-search-empty">No categories found</div>
              ) : null}
            </div>
          </>
        ) : selectedCategory ? (
          <div className="search-head flex items-center justify-between">
            <button type="button" className="pos-search-head-action" onClick={onShowCategories}>
              ← Categories
            </button>
            <strong>{selectedCategory.name}</strong>
            <button type="button" className="pos-search-head-action" onClick={onClearCategory}>
              Clear
            </button>
          </div>
        ) : browse ? (
          <div className="search-head">Recent · last {Math.min(5, results.length)}</div>
        ) : null}
        {!categoryPickerOpen && results.length === 0 ? (
          <div className="pos-search-empty">
            {selectedCategory ? `No products in ${selectedCategory.name}` : "No products found"}
          </div>
        ) : null}
        {!categoryPickerOpen &&
          results.map((result, index) => (
            <button
              key={result.product.id}
              type="button"
              className={`search-hit grid min-h-12 w-full grid-cols-[56px_minmax(0,1fr)_minmax(92px,auto)_minmax(150px,auto)] items-center gap-x-2.5 gap-y-0 border-0 border-b border-line bg-transparent px-2.5 py-1.5 text-left text-[13px] ${index === activeIndex ? "is-active" : ""} ${result.low ? "is-low" : ""} ${result.out ? "is-out" : ""}`}
              onMouseEnter={() => onActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(result.product);
              }}
            >
              <span className="sku">
                {result.product.productNo && result.product.productNo > 0
                  ? result.product.productNo
                  : result.product.sku}
              </span>
              <span className="name">
                <CmwrPriceTip unit={result.tierPrices} hoverOnly className="[max-width:100%]">
                  <span className="name-text">
                    {result.product.name}
                    <small> · {result.unitLabel}</small>
                  </span>
                </CmwrPriceTip>
              </span>
              <span
                className={`stock ${result.low ? "is-low" : ""} ${result.out ? "is-over" : ""}`}
                title={`${result.out ? "Out of stock — " : result.low ? "Low stock — " : ""}${result.stockTitle}`}
              >
                {result.low || result.out ? (
                  <svg className="warn-ico" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M10.02 3.2a1.1 1.1 0 00-1.94 0L1.3 16.05A1.1 1.1 0 002.27 17.7h15.46a1.1 1.1 0 00.97-1.65L10.02 3.2zM10 8.2c.4 0 .7.32.7.72v3.96a.7.7 0 01-1.4 0V8.92c0-.4.3-.72.7-.72zm0 7.1a.85.85 0 110-1.7.85.85 0 010 1.7z"
                    />
                  </svg>
                ) : null}
                <span className="stock-qty">{result.availableLabel}</span>
              </span>
              <span className="price text-right">
                <strong className="price-main">{result.priceLabel}</strong>
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
