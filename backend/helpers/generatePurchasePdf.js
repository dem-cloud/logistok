/**
 * Server-side PDF for purchase documents (PO, GRN, PUR, DBN).
 */
const puppeteer = require("puppeteer");

const DOC_TYPE_LABELS = {
    PO: "Παραγγελία Αγοράς",
    GRN: "Δελτίο Παραλαβής",
    PUR: "Τιμολόγιο Αγοράς",
    DBN: "Πιστωτικό Αγοράς",
};

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

function formatCurrency(amount) {
    if (amount == null || isNaN(amount)) return "0,00 €";
    return new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
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

function computePurchaseVatBreakdown(items) {
    const byRate = {};
    for (const it of items) {
        const lineTotal = it.total_cost ?? it.quantity * it.cost_price;
        const rate = it.vat_exempt ? 0 : (it.vat_rate ?? 0);
        if (!byRate[rate]) byRate[rate] = { base: 0, vat: 0 };
        if (rate === 0) {
            byRate[rate].base += lineTotal;
        } else {
            const base = lineTotal / (1 + rate);
            byRate[rate].base += base;
            byRate[rate].vat += lineTotal - base;
        }
    }
    return Object.entries(byRate).map(([rateStr, vals]) => {
        const rate = Number(rateStr);
        const label = rate === 0 ? "Απαλλασσόμενο" : `ΦΠΑ ${(rate * 100).toFixed(0)}%`;
        return { label, base: vals.base, vat: vals.vat };
    });
}

function buildPurchaseHtml(data) {
    const {
        company = {},
        store = {},
        vendor = null,
        purchase_items = [],
        subtotal = 0,
        vat_total = 0,
        total_amount = 0,
        payment_method_name = "",
        document_type = "PUR",
        invoice_number = "",
        invoice_date = null,
        created_at = null,
        status = "",
        id = "",
        notes = null,
    } = data;

    const docKey = (document_type || "PUR").toString().toUpperCase();
    const docTitle = DOC_TYPE_LABELS[docKey] || document_type;

    const st = (status || "").toLowerCase();
    const isCancelled = st === "cancelled";

    const companyLines = [];
    if (company.tax_id) companyLines.push(`ΑΦΜ: ${company.tax_id}`);
    if (company.tax_office) companyLines.push(`ΔΟΥ: ${company.tax_office}`);
    const companyAddr = [company.address, company.postal_code, company.city, company.country]
        .filter(Boolean)
        .join(", ");
    if (companyAddr) companyLines.push(companyAddr);

    const itemsRows = (purchase_items || []).map((it) => {
        const label = it.product_label || `Προϊόν #${it.product_id}`;
        const lineTotal = it.total_cost ?? it.quantity * it.cost_price;
        return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(String(it.quantity))}</td>
        <td class="num">${formatCurrency(it.cost_price)}</td>
        <td class="num">${formatCurrency(lineTotal)}</td>
      </tr>`;
    }).join("");

    const vatBreakdown = computePurchaseVatBreakdown(purchase_items || []);
    const vatBreakdownRows = vatBreakdown.map(
        (v) => `<tr><td>${escapeHtml(v.label)}</td><td class="num">${formatCurrency(v.base)}</td><td class="num">${formatCurrency(v.vat)}</td></tr>`
    ).join("");

    const vendorBlock = vendor
        ? `
    <div class="block vendor">
      <h3>Προμηθευτής</h3>
      <p><strong>${escapeHtml(vendor.name || "—")}</strong></p>
      ${vendor.phone || vendor.email ? `<p>${escapeHtml([vendor.phone, vendor.email].filter(Boolean).join(" · "))}</p>` : ""}
    </div>`
        : "";

    const dateStr = invoice_date ? String(invoice_date).slice(0, 10) : formatDate(created_at);

    return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans', sans-serif; font-size: 11px; color: #333; padding: 24px; line-height: 1.5; }
    .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
    .company { margin-bottom: 20px; }
    .company h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .block { margin-bottom: 16px; }
    .block h3 { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #555; }
    .num { text-align: right; }
    .totals .total { font-size: 14px; font-weight: 700; margin-top: 10px; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 56px; font-weight: 700; color: rgba(200, 60, 60, 0.6); pointer-events: none; user-select: none; }
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
    <p>Ημερομηνία: ${escapeHtml(dateStr)}</p>
    <p>Αρ.: ${escapeHtml(invoice_number || String(id))}</p>
    ${notes ? `<p>Σημειώσεις: ${escapeHtml(notes)}</p>` : ""}
  </div>
  ${vendorBlock}
  <div class="block">
    <h3>Γραμμές</h3>
    <table>
      <thead>
        <tr><th>Περιγραφή</th><th class="num">Ποσ.</th><th class="num">Τιμή χωρίς ΦΠΑ</th><th class="num">Σύνολο</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
  </div>
  <div class="block">
    <h3>Ανάλυση ΦΠΑ</h3>
    <table>
      <thead><tr><th>Συντελεστής</th><th class="num">Αξία</th><th class="num">ΦΠΑ</th></tr></thead>
      <tbody>${vatBreakdownRows}</tbody>
    </table>
  </div>
  <div class="block totals">
    <p>Υποσύνολο (χωρίς ΦΠΑ): ${formatCurrency(subtotal)}</p>
    <p>ΦΠΑ σύνολο: ${formatCurrency(vat_total)}</p>
    <p class="total">Σύνολο: ${formatCurrency(total_amount)}</p>
    <p style="margin-top: 12px;">Τρόπος πληρωμής: ${escapeHtml(payment_method_name || "—")}</p>
  </div>
</body>
</html>`;
}

async function generatePurchasePdf(data) {
    const html = buildPurchaseHtml(data);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load", timeout: 15000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
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

module.exports = { generatePurchasePdf, buildPurchaseHtml };
