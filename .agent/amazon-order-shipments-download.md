# Amazon Order Shipments Download Agent

<!-- AI-CONTEXT-START -->
## Quick Reference

- **Purpose**: Export Amazon shipment/tracking data to CSV
- **Tool**: `export_amazon_shipments_csv`
- **Output**: Shipment-level data (tracking, delivery status, carrier info)

**Usage**: "Download tracking info for my Amazon orders"
<!-- AI-CONTEXT-END -->

## Description

This agent exports shipment and tracking information from Amazon orders as a CSV file.
Use this for logistics tracking, delivery verification, or shipping analysis.

## CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| shipment_id | Amazon shipment ID | DT7cMbTTr |
| order_id | Parent order ID | 123-4567890-1234567 |
| order_url | Link to order | https://amazon.com/... |
| order_date | Date ordered | 2024-01-15 |
| delivered | Delivery status | YES / NO / UNKNOWN |
| shipping_status | Status text | Delivered Jan 18 |
| tracking_link | Amazon tracking URL | https://amazon.com/progress-tracker/... |
| tracking_id | Carrier tracking # | 1Z999AA10123456784 |

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| region | string | Yes | Amazon domain |
| year | number | No | Specific year |
| start_date | string | No | Start date (ISO format) |
| end_date | string | No | End date (ISO format) |
| output_path | string | Yes | Where to save CSV |
| include_items | boolean | No | Include items per shipment |

## Example Prompts

- "Export tracking info for all my Amazon orders this year"
- "Download shipment status for my recent Amazon purchases"
- "Get delivery confirmation data for my Amazon orders"

## Notes

- Not all orders have tracking information (digital orders, some marketplace sellers)
- Tracking IDs are fetched from Amazon's tracking pages (requires additional requests)
- Delivery status is determined from page content and CSS classes

## Related Agents

- `@amazon-orders-download` - Order summaries
- `@amazon-order-items-download` - Individual items
- `@amazon-order-transactions-download` - Payment transactions
