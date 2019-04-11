# Change Log
Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.3] - 2019-04-11
### Added
- Enabled Actions Report command
- LPL Log output channel (to which report is gernerated)

### Fixed
- Go To Definition from the UI was jumping to a form definition instead of the field definition

## [0.1.2] - 2019-04-08
### Added
- Support for Context fields and KeyFields

### Fixed
- Handling of multiple busclass files for the same business class

## [0.1.1] - 2019-04-03
### Added
- Go To Definition support
- Hover text support

## [0.1.0] - 2019-02-27
### Added
- Individual field rules within `Field Rules` block.
- Additional headings in `bl/*.busclass` files:
    - Apply Pending Effective Rules
    - Audit Entry Rules
    - Commit Rules
    - Create Exit Rules
    - Delete Rules
    - Attach Rules
    - Action Exit Rules
    - Ontology
    - Patterns
    - Context Fields
    - Form Invokes
    - Translation Field Rules

### Fixed
- Parsing fields typed as `is a snapshot of BusinessClass` 

### Changed
- Version increased to reflect greater (Beta?) release readiness

## [0.0.4] - 2019-02-26
### Added
- Add support for parsing `ui/*.busclass` files
- Include `Sets` block in the processing for `bl/*.busclass` files.

## [0.0.3] - 2019-02-25
### Changed
- Update for publishing to Visual Studio Marketplace.

## [0.0.2] - 2019-02-25
### Added
- Alpha release of lpl-outline supports navigating most top level blocks within a `bl/*.busclass` file. Persisted fields, derived fields, transient fields, local fields, relations, conditions, rule blocks and actions are also called out.
- Within actions, if the detail level is set to `deep`, parameters, local fields, rule blocks parameter rules and field rules are also available.