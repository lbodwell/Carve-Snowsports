# Security baseline

- Authentication is invite-only; public registration is disabled.
- Authorization happens in application services for every read and write.
- Sensitive student fields are returned through role-specific view models.
- All mutations validate input server-side and record an audit event.
- Browser requests use same-origin server functions with CSRF protections.
- Production secrets live in the hosting environment; no secret is committed.
- Logs use request and actor identifiers but never health, contact, or import
  cell values.
- Real data cannot be loaded until retention, deletion, access-review, and
  incident-response policies are approved.

Future Entra migration links identities with the stable tenant and object IDs,
not a mutable email claim.
