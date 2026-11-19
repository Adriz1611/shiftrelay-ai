# Checkout manifest validation

When **Validate checkout manifest** fails, inspect the workflow annotation and compare the payment schema revision against the last successful run. A failed step identifies where validation stopped. Confirm the annotation before concluding that the revision caused this incident.

For the controlled demo, put checkout.yml in the dedicated repository under .github/workflows and this document under docs/checkout-runbook.md. Seed an open issue titled “Checkout manifest validation investigation”. Publishing the fixtures and dispatching the workflow each require authorization.
