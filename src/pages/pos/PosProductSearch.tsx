import type { KeyboardEvent, RefObject } from "react";
import type { Product } from "@/shared/types";

export type PosSearchResult = {
  product: Product;
  unitLabel: string;
  availableLabel: string;
  priceLabel: string;
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
    const optionCount = categoryPickerOpen ? categories.length : results.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onActiveIndex(Math.min(activeIndex + 1, Math.max(0, optionCount - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const category = categories[activeIndex];
      if (categoryPickerOpen && category) onCategorySelect(category.id);
      else onEnter();
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
              ? "Choose a category"
              : "Search product, SKU or barcode — F3"
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
              {selectedCategory ? (
                <button type="button" className="pos-search-head-action" onClick={onClearCategory}>
                  All products
                </button>
              ) : null}
            </div>
            <div className="pos-category-results">
              {categories.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  className={`pos-category-hit ${index === activeIndex ? "is-active" : ""} ${category.id === selectedCategory?.id ? "is-current" : ""}`}
                  onMouseEnter={() => onActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onCategorySelect(category.id);
                  }}
                >
                  <span>{category.name}</span>
                  <small>{category.count} products</small>
                </button>
              ))}
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
              className={`search-hit grid min-h-12 w-full grid-cols-[60px_1fr_auto_auto] items-center gap-2 border-0 border-b border-line bg-transparent px-2.5 py-1 text-left text-[13px] ${index === activeIndex ? "is-active" : ""} ${result.low ? "is-low" : ""} ${result.out ? "is-out" : ""}`}
              onMouseEnter={() => onActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(result.product);
              }}
            >
              <span className="sku">{result.product.sku}</span>
              <span className="name">
                <span className="name-text">
                  {result.product.name}
                  <small> · {result.unitLabel}</small>
                </span>
              </span>
              <span
                className={`stock ${result.low ? "is-low" : ""} ${result.out ? "is-over" : ""}`}
                title={result.stockTitle}
              >
                {result.availableLabel}
              </span>
              <span className="price text-right">{result.priceLabel}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
