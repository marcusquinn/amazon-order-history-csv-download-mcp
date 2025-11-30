# Credits & Acknowledgments

## Inspiration

This project was inspired by [AZAD (Amazon Order History Reporter)](https://github.com/philipmulcahy/azad),
a Chrome extension by Philip Mulcahy that extracts Amazon order history to CSV format.

## Original Implementation

This MCP server is an **original implementation** developed independently. It is:

- **NOT** a fork of AZAD
- **NOT** a derivative work
- **NOT** using any AZAD source code

The entire codebase was written from scratch to provide Amazon order history
extraction capabilities through the Model Context Protocol (MCP) for AI assistants.

## Why a New Implementation?

| Aspect | AZAD | This MCP |
|--------|------|----------|
| Architecture | Chrome extension | MCP server |
| Automation | Content script injection | Playwright browser automation |
| Target Users | End users via browser | AI assistants |
| Extensibility | Amazon only | Plugin architecture for multiple platforms |

## Acknowledgments

We gratefully acknowledge:

- **Philip Mulcahy** and the AZAD project for demonstrating the feasibility
  and utility of Amazon order history extraction
- The **MCP (Model Context Protocol)** team for creating an open standard
  for AI tool integration
- The **Playwright** team for excellent browser automation tooling

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
