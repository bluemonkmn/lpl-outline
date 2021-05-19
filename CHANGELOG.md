# Change Log
Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.8] - 2021-05-19
### Added
- Key fields are now reported as missing from import classes if they are not listed and @Import=Exclude is not specified on the .keyfield line 1.
- Relative keys are now identified as fields and can report warnings if missing from imports and not marked with @Import=Exclude.

### Fixed
- Declarations of the form "Field is Alpha up to 20" are now parsed properly.
- Warning messages about missing import fields will exclude entire import business classes with @Import=Exclude on line 1.
- Associating an Import class to the corresponding main business class will now also look for "include FillInFields" to identify an invoke referring to the main business class.

## [0.1.7] - 2021-03-08
### Fixed
- Ability to jump between UI and BL files corrected, for example, to jump from bl\A.B.busclass to ui\A.busclass even if ui\A.B.busclass doesn't exist.

## [0.1.6] - 2021-03-03
### Added
- Added ability to jump between UI and BL files using Ctrl-Alt-G by default.

## [0.1.5] - 2019-12-23
### Added
- Support for parsing StateCycles block and the Cycles, States and actions contained therein.

## [0.1.4] - 2019-06-25
### Added
- Diagnostics to show persistent fields missing from imports

### Fixed
- Parsing of keyfield files is now done similarly to busclass files rather than waiting for a busclass file to become active and running as a side-effect.
- All fields were being treated as persistent fields; corrected to separate them into persistent, local and transient.
- To the extent that they are used in diagnostic underlining, field and action name locations are now properly represented instead of simply using the beginning of the line on which they occur.

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