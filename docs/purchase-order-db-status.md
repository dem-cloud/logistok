# Παραγγελία Αγοράς (PO) — DB status ↔ doc phases

Canonical UX: [invoices-status-map.md](./invoices-status-map.md) (§ «Τύπος Παραστατικού: Παραγγελία Αγοράς»).

| DB `status` | Doc phase (summary) | Notes |
|---------------|----------------------|--------|
| `draft` | 1–2 Πρόχειρη | Phase 2 = same status after save; Διαγραφή only when record exists |
| `sent` / `ordered` | 3 Απεσταλμένη / Ανοιχτή | `ordered` kept for legacy rows |
| `partially_received` | 4 Μερική Παραλαβή | Footer: «Λήψη PDF» όπως στο [invoices-status-map.md](./invoices-status-map.md) φάση 4 |
| `closed` | 5 Κλειστή | After «Κλείσιμο Παραγγελίας» |
| `completed` | 6 Ολοκληρωμένη | Full receipt |
| `cancelled` | 7 Ακυρωμένη | After «Ακύρωση Παραγγελίας» |

Footer/list actions are driven by [app/src/config/documentActions.ts](../app/src/config/documentActions.ts) `getPurchaseButtons` for `document_type === "PO"`.

**Storage:** `purchases.document_type` and `purchases.status` are stored **lowercase** (trimmed) in the API/DB so indexes and filters use plain equality. **GRN / PO:** at most **one draft GRN** per PO (`document_type = grn`, `status = draft`); «Παραλαβή Αγαθών» reuses an existing draft when present (partial unique index + `POST .../create-grn`). See migration `backend/docs/database/migrations/add_purchases_normalize_doc_type_status_and_draft_grn_unique.sql`.
