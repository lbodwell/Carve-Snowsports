# Seasonal Registration 2025–26 adapter

The adapter recognizes the exact legacy header set. It only produces a
no-write preview until an authorized operator reviews reconciliation output.

## Key handling

- `Transaction_ID` is external registration evidence, not a student primary
  key.
- Repeated/missing transaction behavior remains unresolved until representative
  redacted rows are supplied.
- Imported `Instructor`, `Day`, `Time`, `Discipline`, `Level`, and `Lesson`
  are placement evidence. They cannot overwrite a published Carve group.
- `Medication`, `FoodAllergy`, `DrugAllergy`, and `SpecialCondition` create
  restricted support categories; text is never an optimizer input.
- Wide dated columns are stored with source-column provenance. An explicit
  season date mapping is required before they are written as attendance.

## Safe reruns

File hash and source adapter version identify a batch. Reapplying the same
accepted batch is idempotent. Ambiguous person matches must enter a human
review queue; the importer must never silently fuzzy-match them.
