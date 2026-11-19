# Current limitations

Live voice, provider quotas, tool ingress, real account reads and external writes require operator configuration and rehearsal. Session configuration alone cannot establish audio provenance. Issue candidates are matched by service name within the first page of open issues. The local database targets one operator and one checkout service. Process crashes during external writes require manual reconciliation. Discord HTTP 4xx rejection enables a Discord-only retry. Ambiguous delivery is held for manual reconciliation. Live transcript and interruption behavior need verification. Keep the operator workspace on localhost.

For production, add tenant isolation, SSO, managed secret rotation, a durable worker with reconciliation, rate limits, centralized redacted telemetry and retention controls.
