# Amazon Order History Agent

<!-- AI-CONTEXT-START -->

## Quick Reference

- **Purpose**: Export Amazon order history to CSV in various formats
- **MCP Server**: amazon-order-history-csv-download-mcp
- **Export Types**: orders, items, shipments, transactions, gift-cards

**Usage Examples**:

- "Download my Amazon UK orders from 2024"
- "Export item details for my recent Amazon purchases"
- "Get shipment tracking for my Amazon orders"
<!-- AI-CONTEXT-END -->

## Description

This agent helps export Amazon order history data to CSV files. It can extract different levels of detail depending on your needs - from high-level order summaries to detailed item breakdowns with tracking information.

## Available Export Tools

### 1. Orders Summary (`export_amazon_orders_csv`)

Fast export from order list page (~0.5s per 10 orders). Best for browsing and basic reporting.

**Columns**: Order ID, Date, Total, Status, Item Count, Address (7 lines), Subscribe & Save, Platform, Region, Order URL

### 2. Item Details (`export_amazon_items_csv`)

Detailed item-level export (~2s per order). Best for expense tracking and accounting.

**Columns**: Order ID, Date, ASIN, Product Name, Condition, Quantity, Unit Price, Item Total, Seller, Subscribe & Save, Order financials (subtotal, shipping, tax, VAT, promotion, total), Status, Recipient, Address, Payment Method, URLs, Region

### 3. Shipment Tracking (`export_amazon_shipments_csv`)

Shipment and tracking information (~4s per order). Best for delivery tracking.

**Columns**: Order ID, Date, Shipment ID, Status, Delivered, Tracking ID, Carrier, Tracking URL, Items in Shipment, Item Names, Payment Amount, Refund, Region

**Note**: Use `fetch_tracking_numbers: true` to extract actual carrier tracking numbers (adds ~2s per shipment).

### 4. Transactions (`export_amazon_transactions_csv`)

Payment transaction details for financial reconciliation.

**Columns**: Transaction Date, Order ID(s), Payment Method, Card Info, Amount, Currency

### 5. Gift Cards (`export_amazon_gift_cards_csv`)

Gift card activity and balance history.

**Columns**: Date, Description, Type, Amount, Closing Balance, Order ID, Claim Code, Serial Number, Currency, Region

## Common Parameters

| Parameter   | Type   | Required | Description                                                                 |
| ----------- | ------ | -------- | --------------------------------------------------------------------------- |
| region      | string | Yes      | Region code: us, uk, ca, de, fr, es, it, nl, jp, au, mx, in, ae, sa, ie, be |
| year        | number | No       | Year to export (defaults to current)                                        |
| start_date  | string | No       | Start date (YYYY-MM-DD)                                                     |
| end_date    | string | No       | End date (YYYY-MM-DD)                                                       |
| output_path | string | No       | Where to save CSV (defaults to ~/Downloads)                                 |
| max_orders  | number | No       | Limit orders to process                                                     |

## Query Tools (No CSV)

- `get_amazon_orders` - Fetch orders with optional items/shipments as JSON
- `get_amazon_order_details` - Get full details for a specific order
- `get_amazon_transactions` - Fetch transactions from transactions page
- `get_amazon_gift_card_balance` - Get current balance and history
- `check_amazon_auth_status` - Check if browser is logged in

## Example Prompts

**Order Summaries**:

- "Export my Amazon UK orders from 2024"
- "Download my Amazon.com order history for tax season"

**Item Details**:

- "Export all items I bought from Amazon in the last 6 months"
- "Get a detailed breakdown of my Amazon purchases with prices"

**Shipment Tracking**:

- "Export tracking info for my recent Amazon orders"
- "Get carrier and tracking numbers for my Amazon shipments"

**Specific Order**:

- "Get details for Amazon order 123-4567890-1234567"

## Authentication

The browser must be logged into Amazon before running exports. Use `check_amazon_auth_status` to verify, or the tools will prompt for login if needed.

## Performance Tips

- Use `max_orders` to batch large exports and avoid timeouts
- Orders summary is fastest (~0.5s/10 orders)
- Item details adds ~2s per order
- Shipment tracking adds ~4s per order
- `fetch_tracking_numbers` adds ~2s per shipment
