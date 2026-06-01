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
- **ADDR_MARKER_RE must use `/i` flag** — "Sd," (mixed case) was being missed causing address to bleed into the name.
- When no addr marker found (e.g. `بلواضح امينAin Arnat ,عين ارنات`): Arabic names → trim at first Latin char using `^[\u0600-\u06FF][^\u0021-\u007E\u00C0-\u017E]*`; Latin names → strip from first comma.

## Recipient extraction — returns_list (`extractReturnsRecipientNames`)
Uses "common sender prefix" strategy — do NOT use fallback Arabic/Latin regex chains:
1. For each tracking code, extract text between type keyword (Livraison/Echange/Retour) and first phone; flatten newlines → spaces. This is the "middle".
2. Find the longest common prefix across ALL middles → that's the sender name.
3. Strip sender prefix from each middle → recipient remains.
Critical: strip the CX-ref with `/^CX[a-f0-9]{8,16}/i` (hex digits only). Using `[A-Za-z0-9]+` is WRONG — it greedily swallows `LivraisonSENDER` since they're all alphanumeric.
Bound each row's window to the next tracking code to avoid cross-row bleed.

## FDR per-order senders (`extractFDRSenderNames`)
`extractFDRSenders` (Set of unique senders) is for the REPORT-LEVEL display in the header.
`extractFDRSenderNames(text, trackingNums)` returns pipe-separated per-order senders aligned with tracking numbers — stored in `per_order_senders` TEXT column of `office_reports`.
In `admin.ts`, route_sheet virtual orders use `perOrderSendersArr[idx]` for `senderName` instead of the entire pipe-joined list.

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
