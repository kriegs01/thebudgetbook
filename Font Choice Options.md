# Font Choice Options

This document outlines the typeface choices for different UI elements in the application.

## Standard Amount Typeface

- **Font:** Monospace (`font-mono`)
- **Reasoning:** A monospace font is used for all standard amount displays, particularly in tables, to ensure that numbers align vertically. This improves readability and makes it easier for users to compare values at a glance, which is crucial for financial data.
- **Example Usage:**
  ```tsx
  <td className="p-4 font-mono font-medium text-gray-600 dark:text-gray-400">{formatCurrency(displayAmount)}</td>
  ```
