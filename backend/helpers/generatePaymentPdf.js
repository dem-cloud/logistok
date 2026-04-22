/**
 * Server-side PDF for payment documents.
 */
const puppeteer = require("puppeteer");

const STATUS_LABELS = {
    draft: "Πρόχειρη",
    posted: "Οριστικοποιημένη",
    reversed: "Αντιλογισμένη",
};

function formatDate(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
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

function buildPaymentHtml(data) {
    const {
        company = {},
        store = {},
        vendor = null,
        amount = 0,
        payment_method_name = "",
        payment_date = null,
        created_at = null,
        status = "posted",
        id = "",
        notes = null,
        purchase_number = null,
    } = data;

    const isReversed = (status || "").toLowerCase() === "reversed";
    const statusLabel = STATUS_LABELS[(status || "").toLowerCase()] || status;

    const companyLines = [];
    if (company.tax_id) companyLines.push(`ΑΦΜ: ${company.tax_id}`);
    if (company.tax_office) companyLines.push(`ΔΟΥ: ${company.tax_office}`);
    const companyAddr = [company.address, company.postal_code, company.city, company.country]
        .filter(Boolean)
        .join(", ");
    if (companyAddr) companyLines.push(companyAddr);

    const vendorBlock = vendor
        ? `
    <div class="block vendor">
      <h3>Προμηθευτής</h3>
      <p><strong>${escapeHtml(vendor.name || "—")}</strong></p>
      ${vendor.phone || vendor.email ? `<p>${escapeHtml([vendor.phone, vendor.email].filter(Boolean).join(" · "))}</p>` : ""}
    </div>`
        : "";

    const dateStr = payment_date ? formatDate(payment_date) : formatDate(created_at);

    return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Απόδειξη Πληρωμής</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans', sans-serif; font-size: 11px; color: #333; padding: 24px; line-height: 1.5; }
    .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
    .company { margin-bottom: 20px; }
    .company h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .block { margin-bottom: 16px; }
    .block h3 { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #555; }
    .detail-row { display: flex; margin-bottom: 4px; }
    .detail-label { width: 160px; font-weight: 600; color: #555; }
    .detail-value { flex: 1; }
    .amount { font-size: 16px; font-weight: 700; margin-top: 10px; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 56px; font-weight: 700; color: rgba(200, 60, 60, 0.6); pointer-events: none; user-select: none; }
  </style>
</head>
<body>
  ${isReversed ? '<div class="watermark">ΑΝΤΙΛΟΓΙΣΜΕΝΗ</div>' : ""}
  <div class="doc-title">Απόδειξη Πληρωμής</div>
  <div class="company">
    <h2>${escapeHtml(company.display_name || company.name || "Εταιρεία")}</h2>
    ${companyLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
  </div>
  ${vendorBlock}
  <div class="block">
    <h3>Στοιχεία Πληρωμής</h3>
    <div class="detail-row"><span class="detail-label">Αρ. Πληρωμής:</span><span class="detail-value">PAY-${escapeHtml(String(id).padStart(4, "0"))}</span></div>
    <div class="detail-row"><span class="detail-label">Ημερομηνία:</span><span class="detail-value">${escapeHtml(dateStr)}</span></div>
    <div class="detail-row"><span class="detail-label">Κατάσταση:</span><span class="detail-value">${escapeHtml(statusLabel)}</span></div>
    <div class="detail-row"><span class="detail-label">Τρόπος Πληρωμής:</span><span class="detail-value">${escapeHtml(payment_method_name || "—")}</span></div>
    <div class="detail-row"><span class="detail-label">Κατάστημα:</span><span class="detail-value">${escapeHtml(store.name || "—")}</span></div>
    ${purchase_number ? `<div class="detail-row"><span class="detail-label">Σχετικό Τιμολόγιο:</span><span class="detail-value">${escapeHtml(purchase_number)}</span></div>` : ""}
    ${notes ? `<div class="detail-row"><span class="detail-label">Σημειώσεις:</span><span class="detail-value">${escapeHtml(notes)}</span></div>` : ""}
  </div>
  <div class="block">
    <p class="amount">Ποσό: ${formatCurrency(amount)}</p>
  </div>
</body>
</html>`;
}

async function generatePaymentPdf(data) {
    const html = buildPaymentHtml(data);
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

module.exports = { generatePaymentPdf, buildPaymentHtml };
