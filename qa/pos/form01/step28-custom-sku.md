# Step 28 — Custom SKU

**Allowed chars:** letters, digits, `-`, `_`, `.`, `/` · **max length:** 32  
**Uniqueness:** case-insensitive (`ux_products_sku_lower` on `lower(sku)`)  
**Blank create:** auto `P-####` via sequence (skips values already taken by a custom SKU)  
**Update:** owner/manager only when SKU actually changes; cashier → 403; omit/same/blank leaves SKU untouched  
**Invoice lines:** snapshot `product_name` + `sku` at sale time — old bills keep the SKU stored on the line; search/new invoices use the current product SKU  

Screenshot: `step28-custom-sku.png`
