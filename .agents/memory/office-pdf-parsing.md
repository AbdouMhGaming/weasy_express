---
name: Office PDF parsing quirks
description: Ecotrack PDF parse gotchas — tracking regex, recipient extraction per report type, sender name bug, FDR sender line count, PDF download auth.
---

## Tracking number exact pattern
`EC[A-Z0-9]{4}\d{11}` — exactly 17 chars. The old `EC[A-Z0-9]{10,18}` was too greedy and grabbed reference/phone digits appended in the same table cell.

## pdf-parse column merging
Ecotrack PDFs have no column separators. pdf-parse concatenates columns into one text stream per row. Consequences:
- A reference number (2-3 digits) or type suffix (`-EXCH`) appears immediately after the tracking code.
- The sender's reference phone may appear before the recipient name in delivery receipts.
- The recipient's phone appears right after their name with no delimiter.

## Recipient extraction — delivery_receipt (`extractRecipientNames`)
Strategy:
1. Strip leading `-EXCH` / uppercase type suffix after tracking code.
2. Find all Algerian phones (`0[5-7]\d{8}`) in the 500-char window.
3. If letters exist before the first phone → name is before first phone.
4. If only digits/phone before first phone → name is between 1st and 2nd phone.
5. Split by newline, strip leading digits, keep lines with ≥2 letter chars.

## Recipient extraction — route_sheet (`extractFDRRecipientNames`)
FDR layout per row: `EC... → sender lines (1-4) → sender phone → recipient name [AddrMarker, City]`
- Find first Algerian sender phone after tracking code.
- Recipient area starts right after that phone.
- Boundary = min(address marker index, next phone index, 200 chars).
- Address markers: `Sd,` `SD,` `DM,` `AD,` `BR,` `Domicile,` `Centre,` `Noest,` etc.
- Strip trailing marker word from name before boundary.

## FDR sender line count
`extractFDRSenders` regex must use `{1,6}?` not `{1,3}?` — some station names span 4 lines (e.g. "48.1 CP Wasseli\nStation\nRelizane (Oued\nRhiou)").

## Sender name bug — delivery_receipt
`extractDeliverySender` pattern: `\n<digits>DA<SenderName>`. The single capture group captures the sender name (after DA). There is **no** two-group version — earlier code accidentally used a two-group regex and returned group 1 (the amount) instead of group 2 (the name). Current regex uses one group: `m[1]` = sender name.

## PDF file download auth (issue 5)
Browser `<a target="_blank">` cannot set Authorization headers.
- Backend: `/office/reports/:id/file` accepts `?token=<HMAC>` query param and injects it as `Authorization: Bearer <token>` before passing to `adminAuth` middleware.
- Frontend: append `?token=${encodeURIComponent(localStorage.getItem("admin_token") ?? "")}` to the href.

## Why
All bugs traced from actual pdf-parse output of real Ecotrack delivery receipt and FDR PDFs. Column merging is a fundamental pdf-parse limitation with columnar PDFs.
