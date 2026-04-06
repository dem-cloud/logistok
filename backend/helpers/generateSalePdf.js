/**
 * Server-side PDF generation for sales/receipts using Puppeteer.
 * Accepts sale data, renders HTML template, returns PDF buffer.
 */
const puppeteer = require("puppeteer");

// Invoice type labels (all sales document types - Greek)
const INVOICE_TYPE_LABELS = {
    receipt: "Απόδειξη",
    invoice: "Τιμολόγιο",
    QUO: "Προσφορά",
    REC: "Απόδειξη",
    INV: "Τιμολόγιο",
    CRN: "Πιστωτικό Σημείωμα",
    DNO: "Δελτίο Αποστολής",
};

/**
 * Check if company is in Greece (for disclaimer)
 */
function isGreece(country) {
    if (!country || typeof country !== "string") return false;
    const c = country.trim().toLowerCase();
    return ["gr", "el", "ελλάδα", "greece"].includes(c);
}

/**
 * Format date for display
 */
function formatDate(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return String(iso);
    }
}

/**
 * Format currency (EUR)
 */
function formatCurrency(amount) {
    if (amount == null || isNaN(amount)) return "0,00 €";
    return new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Build HTML for sale receipt/invoice
 */
function buildSaleHtml(data) {
    const {
        company = {},
        store = {},
        customer = null,
        sale_items = [],
        subtotal = 0,
        vat_total = 0,
        total_amount = 0,
        amount_paid = null,
        change_returned = null,
        payment_method_name = "",
        invoice_type = "receipt",
        invoice_number = "",
        created_at = null,
        status = "completed",
        id = "",
        vatBreakdown = [],
    } = data;

    const isCancelled = (status || "").toLowerCase() === "cancelled";
    const showDisclaimer = isGreece(company.country);

    const companyLines = [];
    if (company.tax_id) companyLines.push(`ΑΦΜ: ${company.tax_id}`);
    if (company.tax_office) companyLines.push(`ΔΟΥ: ${company.tax_office}`);
    const companyAddr = [company.address, company.postal_code, company.city, company.country]
        .filter(Boolean)
        .join(", ");
    if (companyAddr) companyLines.push(companyAddr);
    if (company.phone) companyLines.push(`Τηλ: ${company.phone}`);
    if (company.email) companyLines.push(`Email: ${company.email}`);

    const docType = (invoice_type || "receipt").toString().toUpperCase();
    const docTitle = INVOICE_TYPE_LABELS[invoice_type] || INVOICE_TYPE_LABELS[docType] || invoice_type;

    const isCreditNote = docType === "CRN";
    const itemsRows = sale_items.map((it) => {
        const label = it.product_label || `Προϊόν #${it.product_id}`;
        const totalPrice = it.total_price ?? it.quantity * it.sale_price;
        const displayTotal = isCreditNote ? -Math.abs(totalPrice) : totalPrice;
        const displayPrice = isCreditNote ? -Math.abs(it.sale_price) : it.sale_price;
        return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(String(it.quantity))}</td>
        <td class="num">${formatCurrency(displayPrice)}</td>
        <td class="num">${formatCurrency(displayTotal)}</td>
      </tr>`;
    }).join("");

    const vatMult = isCreditNote ? -1 : 1;
    const vatBreakdownRows = vatBreakdown.map(
        (v) => `<tr><td>${escapeHtml(v.label)}</td><td class="num">${formatCurrency(v.base * vatMult)}</td><td class="num">${formatCurrency(v.vat * vatMult)}</td></tr>`
    ).join("");

    const customerBlock = customer
        ? `
    <div class="block customer">
      <h3>Πελάτης</h3>
      <p><strong>${escapeHtml(customer.full_name || "—")}</strong></p>
      ${customer.tax_id ? `<p>ΑΦΜ: ${escapeHtml(customer.tax_id)}</p>` : ""}
      ${customer.address || customer.postal_code || customer.city || customer.country
            ? `<p>${escapeHtml([customer.address, customer.postal_code, customer.city, customer.country].filter(Boolean).join(", "))}</p>`
            : ""}
      ${(customer.phone || customer.email) ? `<p>${escapeHtml([customer.phone, customer.email].filter(Boolean).join(" · "))}</p>` : ""}
    </div>`
        : "";

    return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans', sans-serif; font-size: 11px; color: #333; padding: 24px; line-height: 1.5; }
    .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
    .company { margin-bottom: 20px; }
    .company h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .company p { margin: 2px 0; }
    .block { margin-bottom: 16px; }
    .block h3 { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #555; }
    .num { text-align: right; }
    .totals { margin-top: 16px; }
    .totals p { margin: 6px 0; }
    .totals .total { font-size: 14px; font-weight: 700; margin-top: 10px; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 56px; font-weight: 700; color: rgba(200, 60, 60, 0.6); pointer-events: none; user-select: none; }
    .disclaimer { font-size: 9px; color: #888; margin-top: 20px; }
  </style>
</head>
<body>
  ${isCancelled ? '<div class="watermark">ΑΚΥΡΩΘΗΚΕ</div>' : ""}
  <div class="doc-title">${escapeHtml(docTitle)}</div>
  <div class="company">
    <h2>${escapeHtml(company.display_name || company.name || "Εταιρεία")}</h2>
    ${companyLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
  </div>
  <div class="block">
    <h3>Λεπτομέρειες</h3>
    <p>Κατάστημα: ${escapeHtml(store.name || "—")}${store.address ? " · " + escapeHtml(store.address) : ""}</p>
    <p>Ημερομηνία: ${formatDate(created_at)}</p>
    <p>Αρ. Παραστατικού: ${escapeHtml(invoice_number || String(id))}</p>
  </div>
  ${customerBlock}
  <div class="block">
    <h3>Γραμμές προϊόντων</h3>
    <table>
      <thead>
        <tr><th>Περιγραφή</th><th class="num">Ποσ.</th><th class="num">Τιμή</th><th class="num">Σύνολο</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
  </div>
  ${vatBreakdownRows ? `
  <div class="block">
    <h3>Ανάλυση ΦΠΑ</h3>
    <table>
      <thead><tr><th>Συντελεστής</th><th class="num">Αξία</th><th class="num">ΦΠΑ</th></tr></thead>
      <tbody>${vatBreakdownRows}</tbody>
    </table>
  </div>` : ""}
  <div class="block totals">
    <p>Υποσύνολο (χωρίς ΦΠΑ): ${formatCurrency(isCreditNote ? -Math.abs(subtotal) : subtotal)}</p>
    <p>ΦΠΑ σύνολο: ${formatCurrency(isCreditNote ? -Math.abs(vat_total) : vat_total)}</p>
    <p class="total">Σύνολο: ${formatCurrency(isCreditNote ? -Math.abs(total_amount) : total_amount)}</p>
    <p style="margin-top: 12px;">Τρόπος πληρωμής: ${escapeHtml(payment_method_name || "—")}</p>
    ${amount_paid != null ? `<p>Πληρωμένο: ${formatCurrency(amount_paid)}</p>` : ""}
    ${change_returned != null && change_returned > 0 ? `<p>Ρέστα: ${formatCurrency(change_returned)}</p>` : ""}
  </div>
  ${showDisclaimer ? '<p class="disclaimer">Δεν αποτελεί νόμιμο παραστατικό</p>' : ""}
</body>
</html>`;
}

function escapeHtml(str) {
    if (str == null) return "";
    const s = String(str);
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Compute VAT breakdown by rate from sale items
 */
function computeVatBreakdown(items) {
    const byRate = {};
    for (const it of items) {
        const totalPrice = it.total_price ?? it.quantity * it.sale_price;
        const rate = it.vat_exempt ? 0 : (it.vat_rate ?? 0);
        if (!byRate[rate]) byRate[rate] = { base: 0, vat: 0 };
        if (rate === 0) {
            byRate[rate].base += totalPrice;
            byRate[rate].vat += 0;
        } else {
            const base = totalPrice / (1 + rate);
            byRate[rate].base += base;
            byRate[rate].vat += totalPrice - base;
        }
    }
    return Object.entries(byRate).map(([rateStr, vals]) => {
        const rate = Number(rateStr);
        const label = rate === 0 ? "Απαλλασσόμενο" : `ΦΠΑ ${(rate * 100).toFixed(0)}%`;
        return { label, base: vals.base, vat: vals.vat };
    });
}

/**
 * Generate PDF buffer from sale data.
 * @param {Object} data - Sale data: company, store, customer, sale_items, subtotal, vat_total, total_amount, amount_paid, change_returned, payment_method_name, invoice_type, invoice_number, created_at, status, id
 * @returns {Promise<Buffer>}
 */
async function generateSalePdf(data) {
    const items = data.sale_items || [];
    const vatBreakdown = computeVatBreakdown(items);
    const html = buildSaleHtml({ ...data, vatBreakdown });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "load",
            timeout: 15000,
        });
        await page.evaluate(async () => { await document.fonts.ready; });
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
        });
        return Buffer.from(pdfBuffer);
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { generateSalePdf, buildSaleHtml, isGreece, computeVatBreakdown };
