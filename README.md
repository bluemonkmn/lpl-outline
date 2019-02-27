# LPL Outline README

* Provides the necessary data for Visual Studio Code to fill in the Outline panel and breadcrumbs bar for *.busclass files

## Features

Navigate the code using the outline tree or the breadcrumbs bar.

![Outlining and Breadcrumb](images/lpl-outline.gif)

> Tip: The breadcrumbs bar is particularly useful in tracking (displaying) your current location within the file too.

## Requirements	
 
 This extension relies on the Infor LPL Language Server extension already being installed because that declares the busclass file type.

## Extension Settings

* `lpl-outline.detail`
   * `deep`: *(default)* Includes all implemented levels of detail
   * `shallow`: Excludes detail within individual Actions. This is useful in VS Code version 1.31 because the number of symbols in the tree is limited to 7500, and some large files exceed that.

## Known Issues

* No known issues

## Release Notes

See [change log](CHANGELOG.md) for complete history.

### 0.1.0

- Parse individual field rules within `Field Rules` block.
- Mark additional headings in `bl/*.busclass` files:
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

-----------------------------------------------------------------------------------------------------------

## Repository

The code for this extension is [hosted at GitHub](https://github.com/bluemonkmn/lpl-outline)
