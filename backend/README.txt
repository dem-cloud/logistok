# TIPS

- It’s more common to use URL parameters, as it clearly identifies a specific resource. -> e.g. /api/sale/${saleId} | /api/sale/123
- If we're dealing with more flexible search or filtering scenarios where a variable is an optional or secondary parameter, then query parameters might be used. -> e.g. /api/sale?sale_id=${saleId} | /api/sale?sale_id=123