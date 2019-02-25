# LPL Outline README

* Provides the necessary data for Visual Studio Code to fill in the Outline panel and breadcrumbs bar for *.busclass files

## Features

Navigate the code using the outline tree or the breadcrumbs bar.

![Outlining and Breadcrumb](images/lpl-outline.gif)

> Tip: The breadcrumbs bar is particularly useful in tracking (displaying) your current location within the file too.

## Extension Settings

* `lpl-outline.detail`
   * `deep`: *(default)* Includes all implemented levels of detail
   * `shallow`: Excludes detail within individual Actions. This is useful in VS Code version 1.31 because the number of symbols in the tree is limited to 7500, and some large files exceed that.

## Known Issues

* Does not properly parse UI `*.busclass` files yet.

## Release Notes

### 0.0.2

Alpha release of lpl-outline supports navigating most top level blocks within a `bl/*.busclass` file. Persisted fields, derived fields, transient fields, local fields, relations, conditions, rule blocks and actions are also called out. Within actions, if the detail level is set to `deep`, parameters, local fields, rule blocks parameter rules and field rules are also available.

-----------------------------------------------------------------------------------------------------------

## Repository

The code for this extension is [hosted at GitHub](https://github.com/bluemonkmn/lpl-outline)
