# Third-Party Briefing: Meter App Indexing and Inventory Counsel

## Purpose of This Report

This document is intended for a third party who has no prior knowledge of this application, its business context, or its current technical constraints.

We are seeking practical counsel on how to structure and maintain the application's core inventory and indexing model so that we can update schemes, buildings, units, meters, previous readings, and historical records accurately and safely over time.

This is not a sales document. It is an operational and technical briefing that explains:

1. What the application is for
2. How it currently works
3. Where the data and indexing model is struggling
4. What advice and design direction we need

## Executive Summary

The Meter App is a web-based operational tool for managing electricity meter reading workflows across sectional title schemes and similar multi-unit properties.

In plain terms, the application is used to:

1. Maintain a register of schemes, buildings, units, and meters
2. Open monthly reading cycles
3. Capture new readings for bulk and unit meters
4. Validate unusual readings
5. Review and export the results for billing, reconciliation, and disputes

The application already models the main real-world entities, but we are struggling with one core issue:

The system does not yet have a sufficiently strong, stable, and auditable indexing strategy for asset identity and historical change.

As a result, it is difficult to keep the following accurate over time:

1. Which meters belong to which schemes, buildings, and units
2. Which readings should be treated as the authoritative previous reading
3. How historical data should be loaded, preserved, corrected, or replaced
4. How inventory changes such as meter swaps, renamed schemes, unit changes, and legacy imports should be tracked without corrupting the current register

## What the Application Does

At a business level, the application manages meter reading operations for properties that have:

1. One or more schemes or managed properties
2. Buildings within those schemes
3. Units within those buildings
4. Bulk meters, unit meters, and potentially common-property meters
5. Repeating reading cycles, usually monthly

The operational workflow is:

1. Create or maintain the property inventory
2. Open a reading cycle
3. Capture current readings
4. Compare against prior values and historical patterns
5. Flag anomalies
6. Review results
7. Export outputs for downstream use

The app is therefore both:

1. An operational capture system
2. A master-data register for metering assets

That combination is exactly where our current design pressure is highest.

## Current Technical Shape

The current application is a static HTML, CSS, and JavaScript web app.

Important current-state facts:

1. The app has historically used browser local storage as its primary data store.
2. Firebase and Firestore support have been introduced, but the system is still in transition rather than fully cloud-native.
3. Data is still mirrored locally for fast page loads and continuity.
4. Some workflows still behave like a single-user prototype, while others assume shared cloud data.
5. Historical and imported data handling is only partially formalized.

This matters because the inventory and indexing problem is not only a data-model problem. It is also a source-of-truth problem.

## Core Operational Entities

The application currently works with the following operational entities.

### 1. Scheme

Top-level managed property or site.

Examples:

1. A residential complex
2. A commercial property
3. A sectional title scheme

### 2. Building

A physical building or structural grouping within a scheme.

### 3. Unit

An individual apartment, flat, office, shop, or other metered space.

### 4. Meter

A physical electricity meter.

Current meter categories include:

1. Bulk meter
2. Unit meter
3. Common-property meter
4. Legacy or uncertain meter records during migration

### 5. Cycle

A reading period, usually monthly.

### 6. Reading

A captured meter value within a cycle, with metadata such as date, notes, flags, and review status.

### 7. Supporting Historical Layers

The codebase is moving toward distinct historical/supporting collections such as:

1. Meter relationships
2. Meter charges
3. Meter evidence
4. Meter flags
5. Legacy meter mapping
6. Dispute cases

This direction is sensible, but it is not yet fully governed by a stable canonical identity model.

## How the Data Currently Behaves

At present, the system behaves roughly as follows:

1. Schemes, buildings, units, meters, cycles, and readings are stored as application records.
2. Meters keep a mutable `last_reading` field.
3. New readings often depend on that mutable field to calculate consumption and validate anomalies.
4. Imports and transfer workflows can update both readings and the meter's stored last reading.
5. Historical context is partly inferred from prior readings and partly dependent on what has already been loaded into the app.

This creates risk because a summary field such as `last_reading` can drift away from the actual authoritative historical sequence.

## The Problem We Need Counsel On

We are struggling to maintain a trustworthy inventory and indexing structure for the full meter estate.

In practical terms, the following questions are difficult to answer consistently:

1. What is the canonical identity of a meter if meter numbers are duplicated, reformatted, replaced, or imported from legacy files?
2. What is the canonical identity of a unit if building names or scheme structures change over time?
3. When a meter is replaced, moved, split, merged, or reclassified, how should history be preserved?
4. When historical readings are imported, should they overwrite, append to, or reconcile with existing readings?
5. Which reading should be treated as the previous reading for validation and billing logic?
6. How should current operational inventory be separated from historical archives and source documents?
7. How should data be indexed so that updates are accurate, auditable, and safe to correct later?

## Why the Current Model Is Struggling

The current difficulties appear to come from a combination of design pressures.

### 1. No Single Fully Enforced Source of Truth Yet

The app is in transition between local browser storage and Firestore-backed storage.

That creates uncertainty around:

1. Where authoritative data lives
2. Which edits are final
3. How cross-device consistency should be guaranteed

### 2. Mutable Snapshot Fields Are Doing Too Much Work

The meter record stores current state such as `last_reading`, while readings are also stored as historical events.

This means both of these are trying to represent reality:

1. The event history
2. The current snapshot

Without strict rules, they can diverge.

### 3. Asset Identity Is Not Yet Strong Enough for Change Over Time

Meters, schemes, buildings, and units are real-world assets that change.

Examples of change we need to support safely:

1. A meter is replaced but serves the same unit
2. A unit is renumbered
3. A building is renamed
4. A scheme is restructured
5. Legacy spreadsheets use inconsistent naming conventions

These cases require an identity model that distinguishes:

1. Stable asset identity
2. Display names and labels
3. Historical relationships
4. Effective dates

### 4. Historical Imports and Live Operations Are Too Close Together

The codebase already recognizes that reference material such as Utility Dash exports should not become live operational truth automatically.

That is the correct instinct.

However, we still need a formal process for:

1. Staging imported data
2. Matching it to existing entities
3. Reviewing confidence
4. Approving promotion into live records
5. Preserving lineage back to the source file and row

### 5. Inventory Updates Need Event Logic, Not Just CRUD Logic

Simple create, update, and delete operations are not enough for metering inventory.

Certain changes are business events, for example:

1. Meter installed
2. Meter replaced
3. Meter decommissioned
4. Unit merged or split
5. Building reassigned
6. Historical correction applied

Each of these should preserve an audit trail rather than silently rewriting the past.

## Observed Risks in the Current Approach

The key risks we see today are:

1. A reading may validate against the wrong previous value if meter history is incomplete or if `last_reading` has been updated incorrectly.
2. Historical imports may create duplicate or conflicting records if the identity resolution process is weak.
3. A meter replacement may appear as a continuity break or a false negative-consumption event if relationships are not modeled properly.
4. Inventory corrections may overwrite history instead of recording a governed change.
5. Cross-device work may still produce drift if local cache and cloud state are not treated carefully.
6. Operational records and reference archives may be mixed in ways that make audits difficult.

## What We Believe the Third Party Should Assess

We are asking for counsel on the target operating model and data design, especially for indexing and inventory maintenance.

We would like the third party to assess and recommend:

### A. Canonical Identity Strategy

Please advise how we should define stable identifiers for:

1. Schemes
2. Buildings
3. Units
4. Meters
5. Meter relationships over time

We need guidance on which fields should be treated as:

1. Immutable identifiers
2. Business keys
3. Search keys
4. Display labels
5. Legacy aliases

### B. Inventory Change Model

Please advise how updates should be represented when:

1. A meter is replaced
2. A meter number changes
3. A unit is renamed or renumbered
4. A meter moves from one unit or location to another
5. A scheme structure is corrected after historical data already exists

We need a model that preserves history while still making current operations simple.

### C. Historical Reading Authority

Please advise what should count as the authoritative previous reading for:

1. Validation
2. Billing support
3. Reconciliation
4. Dispute handling

We need clear rules for how to derive previous readings when there are:

1. Missing cycles
2. Meter changes
3. Imported legacy records
4. Corrected readings

### D. Import and Reconciliation Pipeline

Please advise on a controlled import model for historical spreadsheets and archive files.

We believe the pipeline should include:

1. Raw import staging
2. Deterministic matching rules
3. Confidence scoring
4. Manual review queue
5. Approved promotion into canonical records
6. Full lineage to source documents

We want confirmation, criticism, or a stronger alternative.

### E. Firestore and Query Indexing

Please advise how the live cloud data should be indexed for reliable querying.

Likely query patterns include:

1. All meters for a scheme
2. All units in a building
3. All readings for a meter in date order
4. The latest approved reading before a cycle
5. All meter changes for a given unit
6. All unresolved import mappings
7. All evidence, flags, and disputes linked to a meter or reading

We need a design that supports these queries without encouraging denormalized drift.

## Proposed Design Direction for Review

The following is our current direction, and we want expert review on whether it is correct.

### 1. Separate Master Data from Event History

Use separate structures for:

1. Current asset register
2. Relationship history
3. Readings
4. Charges
5. Evidence
6. Flags
7. Import lineage

### 2. Treat Readings as Append-Only Events

Avoid treating readings as mutable summary values except where clearly marked as derived current-state snapshots.

### 3. Derive Current State from Governed History

Fields such as latest reading, meter status, or current unit association should be either:

1. Derived from event history, or
2. Stored as controlled projections that can be rebuilt

### 4. Introduce Effective Dating for Relationships

Meter-to-unit, unit-to-building, and building-to-scheme relationships may need effective start and end dates so that historical reports remain explainable.

### 5. Preserve Legacy Mapping Explicitly

Legacy numbers, aliases, and uncertain matches should be stored as mapping records rather than forced directly into live master records.

## Specific Questions for Counsel

We would value direct recommendations on the following:

1. What should the canonical key structure be for schemes, buildings, units, and meters?
2. Should meter history be modeled as a slowly changing dimension, an event stream, or a hybrid?
3. How should meter replacements and rollovers be represented so that validation logic does not misread them as bad data?
4. What is the safest way to compute the previous reading in a mixed environment of live, corrected, and imported data?
5. Which data should be considered editable master data versus immutable operational history?
6. What review and approval process should be mandatory before imported legacy data becomes live system truth?
7. Which Firestore collection layout and indexes would best support both operational performance and auditability?
8. What should be versioned, what should be soft-deleted, and what should never be deleted?

## Desired Outcome

The outcome we want from this counsel process is not just a better schema diagram.

We need a practical operating model that allows our team to:

1. Add and update schemes, buildings, units, and meters confidently
2. Import historical data without corrupting the active register
3. Trace every reading back to a trusted prior state
4. Handle meter replacements and structural changes without losing auditability
5. Keep current operations simple for users while preserving technical rigor underneath

## Recommended Next Deliverables From the Third Party

If the third party accepts this brief, we would ideally like the following deliverables:

1. A recommended canonical data model
2. An identity and indexing strategy
3. A governed inventory-update lifecycle
4. A historical import and reconciliation workflow
5. A Firestore collection and index proposal
6. A migration strategy from the current mixed local/cloud state to a single authoritative model

## Closing Note

The application already captures the right business domain and the right operational workflow. The main difficulty is not whether the app should exist. The difficulty is how to make the underlying register and historical data model reliable enough to support real operational change over time.

That is the area where counsel is requested.