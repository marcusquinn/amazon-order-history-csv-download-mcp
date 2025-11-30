# Amazon Order Items Download Agent

<!-- AI-CONTEXT-START -->
## Quick Reference

- **Purpose**: Export individual Amazon items to CSV
- **Tool**: `export_amazon_items_csv`
- **Output**: Item-level data (product details, ASIN, prices, quantities)

**Usage**: "Download all items I purchased on Amazon this year"
<!-- AI-CONTEXT-END -->

## Description

This agent exports individual items from Amazon orders as a CSV file.
Use this for inventory tracking, product analysis, or detailed purchase records.

## CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| order_id | Parent order ID | 123-4567890-1234567 |
| order_url | Link to order | https://amazon.com/... |
| order_date | Date ordered | 2024-01-15 |
| quantity | Item quantity | 2 |
| description | Product title | USB-C Cable 6ft |
| item_url | Product page link | https://amazon.com/dp/... |
| price | Item price | $12.99 |
| asin | Amazon product ID | B08N5WRWNW |
| category | Product category | Electronics |
| delivered | Delivery status | YES |
| shipping_status | Status text | Delivered |
| tracking_link | Tracking URL | https://amazon.com/... |
| tracking_id | Carrier tracking # | 1Z999AA10123456784 |

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| region | string | Yes | Amazon domain |
| year | number | No | Specific year |
| start_date | string | No | Start date (ISO format) |
| end_date | string | No | End date (ISO format) |
| output_path | string | Yes | Where to save CSV |
| include_category | boolean | No | Fetch product categories (slower) |

## Example Prompts

- "Export all items I bought on Amazon in 2024"
- "Download my Amazon purchase history with ASINs"
- "Get a list of all products I ordered from Amazon UK"

## Related Agents

- `@amazon-orders-download` - Order summaries
- `@amazon-order-shipments-download` - Tracking information
- `@amazon-order-transactions-download` - Payment transactions
