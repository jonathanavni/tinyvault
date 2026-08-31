# Schema

*Optional — keep this if your project has a data model or another durable contract worth documenting in one place; delete it otherwise.*

The canonical description of your data model and key contracts: tables or collections, important field shapes, invariants, and anything an implementer must honor. Read it before investigating data state or writing schema-touching code.

**Keep it in sync:** update `SCHEMA.md` in the *same commit* as any change to a migration, a stored shape, or a contract it documents. A schema doc that drifts from the code is worse than no doc, because future sessions (human or agent) will trust it and be wrong.

The handoff pattern's required-reading rules call for including this doc whenever a Codex slice touches the schema or a contract (see [`docs/handoff-pattern.md`](docs/handoff-pattern.md) §10).

<!-- Document your model below. Example:
## <table / entity>
- `<field>` (`<type>`) — <meaning, constraints, invariants>
-->
