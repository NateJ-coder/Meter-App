# Queensgate — Meter Identity Reference

Purpose: when a captured photo has no usable label (generic filename, no placard visible),
identify it by matching the meter's physical serial number against this list, built from
photos where the unit was already known with confidence.

How entries get added: a meter's serial number is only recorded here once it's been tied to
a unit number with high confidence — either the photo was clearly labeled, or (as with the
batch below) it was cross-validated against a same-date handwritten reading sheet that
listed readings in the same order as the photos. Never added on a guess.

Format: `<canonical meter number> | <service type> | <serial / barcode> | <confirmed from>`

## Confirmed identities

| Meter | Service | Serial / Barcode | Confirmed from |
|---|---|---|---|
| QG 01 | water | 191085944 | Photos/2026.07.02/01.jpg, cross-checked vs QGT Meter Readings 2026.07.02.pdf row 1 (623) |
| QG 02 | water | 191085958 | Photos/2026.07.02/02.jpg, cross-checked vs reading sheet row 2 (931) |
| QG 03 | water | SN252070660 | Photos/2026.07.02/03.jpg, cross-checked vs reading sheet row 3 (29) |
| QG 04 | water | 191085941 | Photos/2026.07.02/04.jpg, cross-checked vs reading sheet row 4 (902) |
| QG 05 | water | SN242002312 | Photos/2026.07.02/05.jpg, cross-checked vs reading sheet row 5 (153) |
| QG 07 | water | 191085946 | Photos/2026.07.02/07.jpg, cross-checked vs reading sheet row 7 (1195) |
| QG 30A | water | 191084143 | Photos/2026.07.02/30.jpg (meter display read 521.x), cross-checked vs reading sheet row 30 (521) |

## Open / not yet confirmed

- QG 06, 08–29, 31–53 (water): position inferred from the 2026.07.02 reading sheet + photo
  sequence, but serial number not individually confirmed yet (only spot-checked 7 of 53).
- No electricity-meter serial numbers captured yet for Queensgate — the 2026.07.02 photo
  batch found was water-only; electricity photos for this cycle weren't located.

## Notes for whoever (or whatever) reads this next

- Queensgate's on-site capture habit is to photograph meters in physical walk order with
  no label in the shot, then separately hand-write a numbered reading sheet in the same
  order. The photo order and the sheet order are the identity link — neither one alone is
  enough.
- Do not assume serial numbers are sequential or otherwise predictable across units; they
  aren't (see table above — no pattern).
