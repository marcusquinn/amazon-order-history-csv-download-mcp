# Amazon Order Transactions Download Agent

<!-- AI-CONTEXT-START -->
## Quick Reference

- **Purpose**: Export Amazon payment transactions to CSV
- **Tool**: `export_amazon_transactions_csv`
- **Output**: Transaction-level data (payment dates, amounts, cards used)

**Usage**: "Download my Amazon payment transactions for accounting"
<!-- AI-CONTEXT-END -->

## Description

This agent exports payment transaction data from Amazon orders as a CSV file.
Use this for financial reconciliation, expense tracking, or accounting purposes.

## CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| date | Transaction date | 2024-01-15 |
| order_ids | Associated order(s) | 123-4567890-1234567 |
| order_urls | Links to orders | https://amazon.com/... |
| vendor | Seller/merchant | Amazon.com |
| card_details | Payment method | Visa ending in 1234 |
| amount | Transaction amount | $129.99 |

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| region | string | Yes | Amazon domain |
| year | number | No | Specific year |
| start_date | string | No | Start date (ISO format) |
| end_date | string | No | End date (ISO format) |
| output_path | string | Yes | Where to save CSV |

## Example Prompts

- "Export my Amazon transactions for 2024 tax preparation"
- "Download payment history from my Amazon account"
- "Get Amazon charges to my credit card this year"

## Notes

- Transaction data is extracted from order detail pages
- Some orders may show "Unknown" payment method due to Amazon's obfuscated HTML
- Multiple orders may share a single transaction (combined shipments)

## Use Cases

- **Tax Preparation**: Match Amazon charges to bank/credit card statements
- **Expense Reports**: Document business purchases
- **Budget Tracking**: Analyze spending patterns
- **Dispute Resolution**: Verify charges

## Related Agents

- `@amazon-orders-download` - Order summaries
- `@amazon-order-items-download` - Individual items
- `@amazon-order-shipments-download` - Tracking information
