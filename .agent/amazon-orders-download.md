# Amazon Orders Download Agent

<!-- AI-CONTEXT-START -->
## Quick Reference

- **Purpose**: Export Amazon order summaries to CSV
- **Tool**: `export_amazon_orders_csv`
- **Output**: Order-level data (totals, taxes, shipping, payments)

**Usage**: "Download my Amazon orders from 2024"
<!-- AI-CONTEXT-END -->

## Description

This agent exports Amazon order history as a CSV file with order-level summary data.
Use this for high-level spending analysis, tax preparation, or financial reconciliation.

## CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| order_id | Amazon order identifier | 123-4567890-1234567 |
| order_url | Link to order details | https://amazon.com/... |
| date | Order date | 2024-01-15 |
| total | Grand total | $129.99 |
| shipping | Shipping cost | $5.99 |
| shipping_refund | Free shipping rebate | $0.00 |
| gift | Gift card amount used | $0.00 |
| tax | Tax (VAT/GST/Sales Tax) | $10.40 |
| refund | Refund amount | $0.00 |
| recipient | Shipping recipient | John Smith |
| payments | Payment method(s) | Visa ending in 1234 |
| invoice_url | Invoice link if available | https://amazon.com/... |

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| region | string | Yes | Amazon domain (amazon.com, amazon.co.uk, etc.) |
| year | number | No | Specific year to export |
| start_date | string | No | Start date (ISO format) |
| end_date | string | No | End date (ISO format) |
| output_path | string | Yes | Where to save the CSV file |

## Example Prompts

- "Export my Amazon.com orders from 2024 to ~/Downloads/amazon-orders-2024.csv"
- "Download all my UK Amazon orders from last year"
- "Get my Amazon order history for tax season"

## Related Agents

- `@amazon-order-items-download` - Individual item details
- `@amazon-order-shipments-download` - Tracking information
- `@amazon-order-transactions-download` - Payment transactions
