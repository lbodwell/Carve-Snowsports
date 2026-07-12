# Microsoft Entra migration runbook

Carve launches with invitation-only Better Auth email/password credentials.
Microsoft Entra is a future provider migration, not an authorization redesign.

1. Obtain an application registration owned by the Entra tenant administrator.
2. Configure the production redirect URI and a staging redirect URI.
3. Store tenant ID, client ID, and secret/client assertion only in host secrets.
4. Link each existing Carve user by Entra `tid` and `oid`. Do not authorize by
   email: it can be absent, mutable, or unverified.
5. Test account linking, role retention, session revocation, and rollback in
   staging with representative staff accounts.
6. Require an access-review sign-off before disabling password sign-in.

Organization membership and role are Carve records. A successful Entra login
does not itself grant organization access.
