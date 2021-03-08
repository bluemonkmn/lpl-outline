import * as vscode from 'vscode';
import { isNumber } from 'util';
import { readFile } from 'fs';

enum LPLBlock {
    ClassRoot = 0,
    PersistentFields,
    Conditions,
    DerivedFields,
    Relations,
    Actions,
    TransientFields,
    LocalFields,
    RuleBlocks,
    Sets,
    FieldRules,
    OtherSection,
    Action,
    Condition,
    DerivedField,
    Relation,
    Field,
    FieldRule,
    RuleBlock,
    ActionParameters,
    ActionLocalFields,
    ActionParameterRules,
    ActionLocalFieldRules,
	ActionRuleBlocks,
	ActionRules,
    ActionOtherSection,
    ActionParameter,
    ActionLocalField,
    ActionParameterRule,
    ActionLocalFieldRule,
	ActionRuleBlock,
	StateCycles,
	StateCycle,
	State,
    List,
    CardView,
    Form,
    CompositeForm,
    SummaryForm
}

class IndentInfo {
    headingIndent: number;
    contentIndent: number | undefined;
    blockType: LPLBlock;
	symbolInformation: vscode.SymbolInformation | undefined;
	cache: ClassCache | undefined;
	formInfo: FormCache | undefined;

    constructor(intentLevel: number, blockType: LPLBlock){
        this.headingIndent = intentLevel;
        this.blockType = blockType;
    }
}

export class ActionCache {
	public parameters = new Map<string, FieldCache>();
	public ruleblocks = new Map<string, vscode.SymbolInformation>();
	public fields = new Map<string, FieldCache>();
	public isRestricted: boolean = false;
	public validWhen: string | undefined;
	constructor(public definition: vscode.SymbolInformation, public hoverText: string, public importComment?: string) { }
}

class RelationCache {
	constructor(public definition: vscode.SymbolInformation) { }
	public targetsRelation: boolean = false;
	public target: string | undefined;
	public hoverText: string | undefined;
}

class FieldCache {	
	constructor(public definition: vscode.SymbolInformation, public hoverText: string, public importComment?: string) { }
}

class FormCache {
	constructor(public definition: vscode.SymbolInformation) { }
	public actionName: string | undefined;
}

export class ClassCache {
	public fields = new Map<string, FieldCache>();
	public relations = new Map<string, RelationCache>();
	public ruleblocks = new Map<string, vscode.SymbolInformation>();
	public actions = new Map<string, ActionCache>();
	public actionForms = new Map<string, FormCache>();
	public definitions: vscode.SymbolInformation[];
	public listContainers: vscode.Uri[] | undefined;
	public isImportFor: {importUri: vscode.Uri, target: string | undefined, viaAction: string} | undefined;
	constructor(definition: vscode.SymbolInformation) {
		this.definitions = [definition];
	}
	// index is keyed by uri.fsPath and each array is sorted by location.range.start.line
	public index: Map<string, vscode.SymbolInformation[]> = new Map<string, vscode.SymbolInformation[]>();
	public indexSymbol(fsPath: string, symbol: vscode.SymbolInformation) {
		let index = this.index.get(fsPath);
		if (index === undefined) {
			index = [];
			this.index.set(fsPath, index);
		}
		if (index.length === 0 ||
			index[index.length-1].location.range.start.line < symbol.location.range.start.line) {
			index.push(symbol);
		} else {
			let location = this.findSymbolByLine(fsPath, symbol.location.range.start.line);
			index.splice(location.indexIndex, 0, symbol);
		}
	}
	public findSymbolByLine(fsPath: string, line: Number): {indexIndex: number; definitionContainsLine: boolean} {
		let index = this.index.get(fsPath);
		if (index === undefined) {
			return {indexIndex: 0, definitionContainsLine: false};
		}
		let bot = 0;
		let top = index.length;
		while (bot < top) {
			let mid = Math.floor((bot + top ) / 2);
			if (index[mid].location.range.start.line > line) {
				top = mid;
			} else if (index[mid].location.range.end.line < line) {
				bot = mid + 1;
			} else {
				if (index[mid].location.range.start.line <= line &&
					index[mid].location.range.end.line >= line) {
					return {indexIndex: mid, definitionContainsLine: true};
				} else {
					return {indexIndex: mid, definitionContainsLine: false};
				}
			}
		}
		if (index.length > bot &&
			index[bot].location.range.start.line <= line &&
			index[bot].location.range.end.line >= line) {
				return {indexIndex: bot, definitionContainsLine: true};
		} else {
			return {indexIndex: bot, definitionContainsLine: false};
		}
	}

	public removeFileFromCache(fsPath: string) {
		let defIndex = this.definitions.findIndex((d) => {return d.location.uri.fsPath === fsPath;});
		if (defIndex) {
			this.definitions.splice(defIndex, 1);
		}
		for(let collection of [this.fields, this.relations, this.actions, this.actionForms]) {
			for(let [name, value] of collection) {
				if (value.definition.location.uri.fsPath === fsPath) {
					collection.delete(name);
				}
			}
		}
		for(let [name, value] of this.ruleblocks) {
			if (value.location.uri.fsPath === fsPath) {
				this.ruleblocks.delete(name);
			}
		}
		if (this.isImportFor !== undefined &&  this.isImportFor.importUri.fsPath === fsPath) {
			this.isImportFor = undefined;
		}
		this.index.delete(fsPath);
	}

	public merge(cache: ClassCache) {
		for (let definition of cache.definitions) {
			if (this.definitions.findIndex((d) => {return d.location.uri.fsPath === definition.location.uri.fsPath;}) >= 0) {
				this.removeFileFromCache(definition.location.uri.fsPath);
			}
			this.definitions.push(definition);
		}
		for(let [name, value] of cache.fields) {				
			this.fields.set(name, value);
		}
		for(let [name, value] of cache.relations) {
			this.relations.set(name, value);
		}
		for(let [name, value] of cache.actions) {
			this.actions.set(name, value);
		}
		for(let [name, value] of cache.actionForms) {
			this.actionForms.set(name, value);
		}
		for(let [name, value] of cache.ruleblocks) {
			this.ruleblocks.set(name, value);
		}
		for(let [name, value] of cache.index) {
			this.index.set(name, value);
		}
		if (cache.listContainers !== undefined) {
			if (this.listContainers !== undefined) {
				for(let listContainer of cache.listContainers) {
					if (this.listContainers.findIndex((l) => {
						return l.fsPath === listContainer.fsPath;
					}) < 0) {
						this.listContainers.push(listContainer);
					}
				}
			} else {
				this.listContainers = cache.listContainers;
			}
		}
		if (cache.isImportFor !== undefined) {
			this.isImportFor = cache.isImportFor;
		}
	}
}

class SimpleTextLine {
	private _firstNonWhitespaceCharacterIndex: number | undefined;

	constructor(public text: string) { }
	public get isEmptyOrWhitespace(): boolean {
		return this.firstNonWhitespaceCharacterIndex >= this.text.length;
	}

	public get firstNonWhitespaceCharacterIndex(): number {
		if (this._firstNonWhitespaceCharacterIndex === undefined) {
			if (this.text.length > 0) {
				let match = /\S/.exec(this.text);
				if (match !== null) {
					this._firstNonWhitespaceCharacterIndex = match.index;
				} else {
					this._firstNonWhitespaceCharacterIndex = this.text.length;
				}
			} else {
				this._firstNonWhitespaceCharacterIndex = 0;
			}
		}
		return this._firstNonWhitespaceCharacterIndex;
	}
}

export class SimpleDocument {
	lines: string[];
	private constructor(public uri: vscode.Uri, content: string) {
		this.lines = content.split(/\r?\n/);
	}

	static getSimpleDocument(uri: vscode.Uri): Promise<SimpleDocument> {
		return new Promise<SimpleDocument>((resolve, reject) => {
			readFile(uri.fsPath, "utf8", (err, data: string) => {
				if (err) {
					reject(err.message);
				}
				resolve(new SimpleDocument(uri, data));
			});
	
		});
	}

	get lineCount(): number {
		return this.lines.length;
	}

	lineAt(line: number): SimpleTextLine {
		return new SimpleTextLine(this.lines[line]);
	}

}

export class BusinessClassDocumentSymbolProvider implements vscode.DocumentSymbolProvider, vscode.HoverProvider, vscode.DefinitionProvider {
	includeActionDetail: Boolean = vscode.workspace.getConfiguration("lpl-outline").detail === "deep";
	diagnostics: vscode.DiagnosticCollection | undefined;

	public cacheSymbols(document: vscode.TextDocument | SimpleDocument, token?: vscode.CancellationToken | undefined): ClassCache | undefined {
		if (this.parsedCache.has(document.uri.fsPath)) {
			return this.parsedCache.get(document.uri.fsPath);
		}
		let result = this.parseDocument(document, token);
		if (result !== undefined) {
			this.updateCache(document, result.classcache);
			return result.classcache;
		}
	}

	public cacheKeyField(document: vscode.TextDocument | SimpleDocument): ClassCache | undefined {
		if (this.parsedCache.has(document.uri.fsPath)) {
			return this.parsedCache.get(document.uri.fsPath);
		}
		let result = this.parseKeyField(document);
		if (result !== undefined) {
			this.updateCache(document, result.classcache);
			return result.classcache;
		}
	}

	public provideDocumentSymbols(
        document: vscode.TextDocument,    
        token: vscode.CancellationToken): vscode.SymbolInformation[]
    {
		let result: {symbols: vscode.SymbolInformation[]; classcache: ClassCache} | undefined;
		if (document.languageId === "keyfield") {
			result = this.parseKeyField(document);
		} else {
			result = this.parseDocument(document, token);
		}
		if (result !== undefined) {
			this.updateCache(document, result.classcache);
			this.checkImportClasses(undefined);
			return result.symbols;
		}
		return [];
	}

    private parseDocument(
        document: vscode.TextDocument | SimpleDocument,
        token?: vscode.CancellationToken | undefined): {symbols: vscode.SymbolInformation[]; classcache: ClassCache} | undefined
    {
		let result: vscode.SymbolInformation[] = [];
		let classInfo: ClassCache | undefined;
		let actionInfo: ActionCache | undefined;
		let relationInfo: RelationCache | undefined;
		let formInfo: FormCache | undefined;
        let classNamePattern = /^\s*(\w+)\s+is\s+a\s+BusinessClass\s*$/;
        let className: string = '';
        let headingPattern = /^(\s+)(Persistent Fields|Conditions|Derived Fields|Relations|Actions|Field Rules|Local Fields|Transient Fields|Field Groups|Rule Blocks|Sets|Apply Pending Effective Rules|Audit Entry Rules|Commit Rules|Create Exit Rules|Delete Rules|Attach Rules|Action Exit Rules|Ontology|Patterns|Context Fields|Translation Field Rules|Form Invokes|StateCycles)\s*(\/\/[^\n]*)?$/;
        let actionHeadingPattern = /^(\s+)(Queue Mapping Fields|Set Is|Parameters|Parameter Rules|Local Fields|Results|Field Rules|SubType|Accumulators|Instance Selection|Sort Order(\s+is\s+\w+)|Action Rules|Entrance Rules|Exit Rules|InitiateRequest Rules|UpdateRequest Rules|CancelRequest Rules|Rollback Rules|Rule Blocks|restricted|valid\s+when\s*\(([^)]+)\))\s*(\/\/[^\n]*)?$/;
        let comment =  /^\s*\/\/[^\n]*$/;
        let preprocessor = /^\#[^\n]*$/;
        let actionPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(Request)?Action\s*(\/\/[^\n]*)?$/;
        let derivedPattern = /^\s+(\w+)\s+is\s+(a|an)\s+((\w+)\s+)?(aggregation\s+of\s(\w+)|ConditionalField|ComputeField|InstanceCount|StringField|MessageField|LabelField|DerivedField|NativeField)\s*(\/\/[^\n]*)?$/;
		let relationPattern = /^\s+(\w+)(\s+(is\s+(a|an)\s+)?(\w+)\s+set)?\s*(\/\/[^\n]*)?$/;
		let relationTargetPattern = /^\s+one-to-(one|many)\s+relation\s+(to|using)\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let fieldPattern = /^\s+(\w+)(\s+is\s+((a|an|like)\s+)?(\w+(\s+view)?|BusinessObjectReference\s+to\s+(\w+)|Unsigned\s+(Decimal|Percent)|EmailAddressField\s+with\s+multiple\s+addresses|Iteration\s+of\s+(\w+)|snapshot\s+of\s+[\w._]+)((\s+size(\s+fixed|\s+up\s+to)?)?\s+\d+(\.\d+)?|(\s+group|\s+compute)(\s+in subject \w+)?)?)?\s*(\/\/[^\n]*)?$/;
		let importCommentPattern = /\@Import\s*=\s*(\w+)\b/;
        let simpleNamePattern = /^\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let fullFieldName = /^\s+([\w_.]+|bod id|(create|update) stamp(\.actor)?|relevance score|(authenticated|agent)\s*actor[\w_.]*|action comment|action type[\w_.]*|action tag|applied stamp|audit entry id|audit period[\w._]*|correction comment|effective date|effective time zone|effective through|entry stamp|initiating action|invoking action|reason code|system stamp|action request id|changed field names|changed fields|purge date|audit transaction id|server identity|remote identity|current async action request id|current action background group id|has future changes|user fields\s*(\(\w+\))?)\s*(\/\/[^\n]*)?$/;
		let dataLoadSingleInvoke = /^\s+invoke\s+(Create|Import)\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let stateCycle = /^\s+(\w+)\s+is\s+a\s+StateCycle\s*(\/\/[^\n]*)?$/;
		let stateCycleState = /^\s+(\w+)\s+is\s+a\s+State\s*(\/\/[^\n]*)?$/;
        
        let uiHeadingPattern = /^\s+(\w+)?(Context Message Invocations|Drill List|\s+is\s+(a|an)\s+((\w+)\s+Message|Navigation|CardView|(\w+\s+)?List|AuditList|DrillList|InstanceCountChart|Form|ActionForm|CompositeForm|WizardForm|MatrixForm|SearchForm|SummaryForm))\s*(\/\/[^\n]*)?$/;
        let uiSubsectionPattern = /^\s+(Display Fields|Actions|Instance Selection|Layout|(\w+)\s+is\s+a\s+(Panel|MultiListPanel)|Detail Sections)\s*(\/\/[^\n]*)?$/;
        let cardViewSection = /^\s+(left column|main column|right column)(\s+is\s+([A-Za-z0-9_.]+|representative image))?\s*(\/\/[^\n]*)?$/;
		let summaryFormSection = /^\s+(First Page Header|Page Header|Page Footer|Layout)\s*(\/\/[^\n]*)?$/;
		let actionIsPattern = /^\s+action\s+is\s+(\w+)\s*(\/\/[^\n]*)?$/;

        let match: RegExpExecArray | null;
        let currentBlock: IndentInfo = new IndentInfo(0, LPLBlock.ClassRoot);
        let indentInfo: IndentInfo[] = [];

        // Refresh includeActionDetail from settings
        this.includeActionDetail = vscode.workspace.getConfiguration("lpl-outline").detail === "deep";

        for (let lineNum=0; lineNum < document.lineCount; lineNum++) {
            let line = document.lineAt(lineNum);
            if (comment.test(line.text) || line.isEmptyOrWhitespace || preprocessor.test(line.text)) {
                continue;
            }
            let indent = this.getColumn(line.text, line.firstNonWhitespaceCharacterIndex);
            while (indent <= currentBlock.headingIndent && currentBlock.symbolInformation !== undefined) {
                let pushData = this.popBlock(document, lineNum, currentBlock);
                if (pushData !== undefined) {
					result.push(pushData);
                }
                let pop = indentInfo.pop();
                if (pop === undefined) {
                    break;
                }
                currentBlock = pop;
            }

            if (currentBlock.contentIndent === undefined || indent === currentBlock.contentIndent) {
                switch(currentBlock.blockType) {
                    case LPLBlock.ClassRoot:
                        if (currentBlock.symbolInformation === undefined) {
                            match = classNamePattern.exec(line.text);
                            if (match !== null) {
								className = match[1];
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    match[1],
                                    vscode.SymbolKind.Class,
                                    '',
                                    new vscode.Location(document.uri, new vscode.Position(0,0))
                                );
								classInfo = new ClassCache(currentBlock.symbolInformation);
                            }
                        } else {
                            match = headingPattern.exec(line.text);
                            let symbolText: string;
                            let symbolKind = vscode.SymbolKind.Namespace;
                            if (match === null) {
                                match = uiHeadingPattern.exec(line.text);
                                if (match !== null) {
                                    if (match[1]) {
                                        symbolText = match[1];
                                    } else {
                                        symbolText = match[2];
									}
                                } else {
                                    symbolText = ""; // TSLint(?) apparently cannot detect that this will never apply below
                                }
                            } else {
                                symbolText = match[2];
                            }
                            if (match !== null) {
                                currentBlock.contentIndent = indent;
                                indentInfo.push(currentBlock);
                                if (match[2] === "Persistent Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.PersistentFields);
                                } else if (match[2] === "Conditions") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Conditions);
                                } else if (match[2] === "Actions") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Actions);
                                } else if (match[2] === "Derived Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.DerivedFields);
                                } else if (match[2] === "Relations") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Relations);
                                } else if (match[2] === "Transient Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.TransientFields);
                                } else if (match[2] === "Local Fields") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.LocalFields);
                                } else if (match[2] === "Rule Blocks") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.RuleBlocks);
                                } else if (match[2] === "Field Rules" ||
                                    match[2] === "Translation Field Rules") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.FieldRules);
                                } else if (match[2] === "Sets") {
                                    currentBlock = new IndentInfo(indent, LPLBlock.Sets);
                                } else if (match[4] === "List" || match[6] !== undefined) {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.List);
                                } else if (match[4] === "CardView") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.CardView);
                                } else if (match[4] === "ActionForm" ||
                                    (match[4] === "Form")) {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.Form);
                                } else if (match[4] === "CompositeForm") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.CompositeForm);
                                } else if (match[4] === "SummaryForm") {
                                    symbolKind = vscode.SymbolKind.Interface;
                                    currentBlock = new IndentInfo(indent, LPLBlock.SummaryForm);
                                } else if (match[4] === "Navigation" ||
                                    match[4] === "Message") {
                                    symbolKind = vscode.SymbolKind.Class;
									currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
								} else if (match[2] === "StateCycles") {
									currentBlock = new IndentInfo(indent, LPLBlock.StateCycles);
                                } else {
                                    currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                                }
                                currentBlock.symbolInformation = new vscode.SymbolInformation(
                                    symbolText,
                                    symbolKind,
                                    className,
                                    new vscode.Location(
                                        document.uri,
                                        new vscode.Position(lineNum, 0)
                                    )
								);
								if (currentBlock.blockType === LPLBlock.Form) {
									formInfo = new FormCache(currentBlock.symbolInformation);
									currentBlock.cache = classInfo;
									currentBlock.formInfo = formInfo;
								}
								if (currentBlock.blockType === LPLBlock.List && classInfo !== undefined) {
									if (classInfo.listContainers === undefined) {
										classInfo.listContainers = [document.uri];
									} else if (classInfo.listContainers.findIndex((l) => {
										return l.fsPath === document.uri.fsPath;
									}) < 0) {
										classInfo.listContainers.push(document.uri);
									}
								}
                            }    
                        }
                        break;
                    case LPLBlock.PersistentFields:
                    case LPLBlock.TransientFields:
                    case LPLBlock.LocalFields:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
							let kind: vscode.SymbolKind;
                            switch (currentBlock.blockType) {
                                case LPLBlock.LocalFields:
                                    kind = vscode.SymbolKind.Variable;
                                    break;
                                case LPLBlock.TransientFields:
                                    kind = vscode.SymbolKind.Property;
                                    break;
                                case LPLBlock.PersistentFields:
                                default:
                                    kind = vscode.SymbolKind.Field;
                                    break;
							}
							let importComment: string | undefined;
							if (match[16] !== null) {
								let comment = importCommentPattern.exec(match[16]);
								if (comment !== null && comment[1]) {
									importComment = comment[1];
								}
							}
							indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Field);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                kind,
                                className,
								new vscode.Location(document.uri, new vscode.Range(lineNum, line.firstNonWhitespaceCharacterIndex, lineNum, line.firstNonWhitespaceCharacterIndex + match[1].length)));
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight(), importComment));
							}
                        }
                        break;
                    case LPLBlock.Conditions:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Condition);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Boolean,
                                className,
                                new vscode.Location(document.uri, new vscode.Position(lineNum, 0)));
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
						}
                        break;
                    case LPLBlock.Actions:
					case LPLBlock.State:
                        match = actionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
							}
							let importComment: string | undefined;
							if (match[6] !== null) {
								let comment = importCommentPattern.exec(match[6]);
								if (comment !== null && comment[1]) {
									importComment = comment[1];
								}
							}
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Action);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Method,
                                className,
                                new vscode.Location(document.uri,
									new vscode.Range(lineNum, line.firstNonWhitespaceCharacterIndex, lineNum, line.firstNonWhitespaceCharacterIndex + match[1].length)));
							if (classInfo !== undefined) {
								actionInfo = new ActionCache(currentBlock.symbolInformation, line.text.trimRight(), importComment);
								classInfo.actions.set(match[1], actionInfo);
								currentBlock.cache = classInfo;
							}
                        }
                        break;
                    case LPLBlock.DerivedFields:
                        match = derivedPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.DerivedField);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
							if (classInfo !== undefined) {
								classInfo.fields.set(match[1], new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
                        }
                        break;
                    case LPLBlock.Relations:
                        match = relationPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.Relation);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Interface,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
							if (classInfo !== undefined) {
								classInfo.relations.set(match[1], relationInfo = new RelationCache(currentBlock.symbolInformation));
							}
                        }
                        break;
                    case LPLBlock.Sets:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Key,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;                    
                    case LPLBlock.List:
                    case LPLBlock.Form:                    
                        match = uiSubsectionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Object,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        } else {
							match = actionIsPattern.exec(line.text);
							if (match !== null && formInfo !== undefined) {
								formInfo.actionName = match[1];
							}
							currentBlock.cache = classInfo;
						}
                        break;
                    case LPLBlock.SummaryForm:
                        match = summaryFormSection.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Namespace,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.CompositeForm:
                        match = uiSubsectionPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            let name: string;
                            let kind: vscode.SymbolKind;
                            if (match[3]) {
                                name = match[2];
                                kind = vscode.SymbolKind.Class;
                            } else {
                                name = match[1];
                                kind = vscode.SymbolKind.Namespace;
                            }
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                name,
                                kind,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.CardView:
                        match = cardViewSection.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.OtherSection);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Interface,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.Action:
                        match = actionHeadingPattern.exec(line.text);
                        if (match !== null) {
                            currentBlock.contentIndent = indent;
							if (match[2] === "restricted" && actionInfo !== undefined) {
								actionInfo.isRestricted = true;
							} else if (match[4] && actionInfo !== undefined) {
								actionInfo.validWhen = match[4];
							} else {
								indentInfo.push(currentBlock);
								if (match[2] === "Parameters") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionParameters);
								} else if (match[2] === "Parameter Rules") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionParameterRules);
								} else if (match[2] === "Local Fields") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFields);
								} else if (match[2] === "Field Rules") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFieldRules);
								} else if (match[2] === "Rule Blocks") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionRuleBlocks);
								} else if (match[2] === "Action Rules") {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionRules);
									if (classInfo !== undefined && actionInfo !== undefined && actionInfo.definition.name.startsWith("CreateSingle")) {
										classInfo.isImportFor = {importUri: document.uri, target:actionInfo.importComment, viaAction: actionInfo.definition.name};
									}
								} else {
									currentBlock = new IndentInfo(indent, LPLBlock.ActionOtherSection);
								}
								currentBlock.symbolInformation = new vscode.SymbolInformation(
									match[2],
									vscode.SymbolKind.Namespace,
									className,
									new vscode.Location(
										document.uri,
										new vscode.Position(lineNum, 0)
									)
								);
							}
                        }
                        break;
                    case LPLBlock.ActionParameters:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionParameter);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Variable,
                                className,
                                new vscode.Location(document.uri,
									new vscode.Position(lineNum, 0)));
							if (actionInfo !== undefined) {
								actionInfo.parameters.set(currentBlock.symbolInformation.name,
									new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
                        }
                        break;
                    case LPLBlock.ActionParameterRules:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionParameterRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionLocalFields:
                        match = fieldPattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalField);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Variable,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
							if (actionInfo !== undefined) {
								actionInfo.fields.set(currentBlock.symbolInformation.name,
									new FieldCache(currentBlock.symbolInformation, line.text.trimRight()));
							}
                        }
                        break;
                    case LPLBlock.ActionLocalFieldRules:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionLocalFieldRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
                    case LPLBlock.ActionRuleBlocks:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.ActionRuleBlock);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
							if (actionInfo !== undefined) {
								actionInfo.ruleblocks.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation); 
							}
                        }
						break;
					case LPLBlock.ActionRules:
						if (currentBlock.contentIndent === undefined) {
							currentBlock.contentIndent = indent;
						}
						if (actionInfo !== undefined && actionInfo.definition.name.startsWith("CreateSingle") && classInfo !== undefined
						&& (classInfo.isImportFor === undefined || classInfo.isImportFor.target === undefined)) {
							match = dataLoadSingleInvoke.exec(line.text);
							if (match !== null) {
								if (classInfo !== undefined) {
									console.log(`${className} is import for ${match[2]}`);
									classInfo.isImportFor = {importUri: document.uri, target: match[2], viaAction: actionInfo.definition.name};
								}
							}
						}
						break;	
                    case LPLBlock.RuleBlocks:
                        match = simpleNamePattern.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.RuleBlock);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
									new vscode.Position(lineNum, 0)));
							if (classInfo !== undefined) {
								classInfo.ruleblocks.set(currentBlock.symbolInformation.name, currentBlock.symbolInformation);
							}
                        }
                        break;
                    case LPLBlock.FieldRules:
                        match = fullFieldName.exec(line.text);
                        if (match !== null) {
                            if (currentBlock.contentIndent === undefined) {
                                currentBlock.contentIndent = indent;
                            }
                            indentInfo.push(currentBlock);
                            currentBlock = new IndentInfo(indent, LPLBlock.FieldRule);
                            currentBlock.symbolInformation = new vscode.SymbolInformation(
                                match[1],
                                vscode.SymbolKind.Function,
                                className,
                                new vscode.Location(document.uri,
                                    new vscode.Position(lineNum, 0)));
                        }
                        break;
					case LPLBlock.Relation:
                        if (currentBlock.contentIndent === undefined) {
                            currentBlock.contentIndent = indent;
						}
						match = relationTargetPattern.exec(line.text);
						if (match !== null && relationInfo !== undefined) {
							relationInfo.target = match[3];
							if (match[2] === "using") {
								relationInfo.targetsRelation = true;
							}
							relationInfo.hoverText = line.text.trimRight();
							relationInfo = undefined;
						}
						break;
                    case LPLBlock.Condition:
                    case LPLBlock.OtherSection:
                    case LPLBlock.ActionOtherSection:                                        
                    case LPLBlock.DerivedField:
                    case LPLBlock.RuleBlock:
                    case LPLBlock.ActionLocalField:
                    case LPLBlock.ActionLocalFieldRule:
                    case LPLBlock.ActionParameter:
                    case LPLBlock.ActionParameterRule:
                    case LPLBlock.ActionRuleBlock:
                    case LPLBlock.Field:
                    case LPLBlock.FieldRule:
                        if (currentBlock.contentIndent === undefined) {
                            currentBlock.contentIndent = indent;
                        }
                        break;
					case LPLBlock.StateCycles:
						match = stateCycle.exec(line.text);
						if (match !== null) {
							if (currentBlock.contentIndent === undefined) {
								currentBlock.contentIndent = indent;
							}
							indentInfo.push(currentBlock);
							currentBlock = new IndentInfo(indent, LPLBlock.StateCycle);
							currentBlock.symbolInformation = new vscode.SymbolInformation(
								match[1],
								vscode.SymbolKind.Enum,
								className,
								new vscode.Location(document.uri,
									new vscode.Position(lineNum, 0)));
						}
						break;
					case LPLBlock.StateCycle:
						match = stateCycleState.exec(line.text);
						if (match !== null) {
							if (currentBlock.contentIndent === undefined) {
								currentBlock.contentIndent = indent;
							}
							indentInfo.push(currentBlock);
							currentBlock = new IndentInfo(indent, LPLBlock.State);
							currentBlock.symbolInformation = new vscode.SymbolInformation(
								match[1],
								vscode.SymbolKind.EnumMember,
								className,
								new vscode.Location(document.uri,
									new vscode.Position(lineNum, 0)));
						}
						break;
					default:
                        console.log("Unhandled block type: " + currentBlock.blockType);
                        break;
                }
            }
        }

        let lineNum = document.lineCount;
        while (true) {
            let pushData = this.popBlock(document, lineNum, currentBlock);
            if (pushData !== undefined) {
                result.push(pushData);
            }
            let pop = indentInfo.pop();
            if (pop === undefined) {
                break;
            }
            currentBlock = pop;
		}
		if (classInfo === undefined) {
			return undefined;
		}
        return {symbols: result, classcache: classInfo};
    }

	// Ensure that this.parsedCache always links a document uri to the ClassCache,
	// and this.symbolCache always links a class name to a BL ClassCache, which in turn links to a UI ClassCache
	// when both are available, or links directly to a UI ClassCache if that's all that's available.
	private updateCache(document: vscode.TextDocument | SimpleDocument, toCache: ClassCache) {		
		let existingClass = this.symbolCache.get(toCache.definitions[0].name);
		if (existingClass) {
			existingClass.merge(toCache);
			this.parsedCache.set(document.uri.fsPath, existingClass);
		} else {
			this.symbolCache.set(toCache.definitions[0].name, toCache);
			this.parsedCache.set(document.uri.fsPath, toCache);
		}
	}

    private getColumn(line: string, end: number) : number {
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return 0;
        }

        let tabSize = isNumber(editor.options.tabSize) ? editor.options.tabSize : 4;
        let width = 0;

        for (let charIndex = 0; (charIndex < end) && charIndex < line.length; charIndex++) {
            if (line.charAt(charIndex) === '\t') {
                width = (Math.floor(width / tabSize) + 1) * tabSize;
            } else {
                width++;
            }            
        }
        return width;
    }

    private popBlock(document: vscode.TextDocument | SimpleDocument, lineNum: number, currentBlock: IndentInfo): vscode.SymbolInformation | undefined {

        switch(currentBlock.blockType){
            case LPLBlock.ActionLocalField:
            case LPLBlock.ActionLocalFieldRule:
            //case LPLBlock.ActionLocalFieldRules:
            //case LPLBlock.ActionLocalFields:
            //case LPLBlock.ActionOtherSection:
            case LPLBlock.ActionParameter:
            case LPLBlock.ActionParameterRule:
            //case LPLBlock.ActionParameterRules:
            //case LPLBlock.ActionParameters:
            case LPLBlock.ActionRuleBlock:
            //case LPLBlock.ActionRuleBlocks:
                if (!this.includeActionDetail) {
                    return;
                }
        }

        if (currentBlock.symbolInformation !== undefined) {
            currentBlock.symbolInformation = new vscode.SymbolInformation(
                currentBlock.symbolInformation.name,
                currentBlock.symbolInformation.kind,
                currentBlock.symbolInformation.containerName,
                new vscode.Location(
                    currentBlock.symbolInformation.location.uri,
                    new vscode.Range(
                        currentBlock.symbolInformation.location.range.start,
                        new vscode.Position(lineNum-1, document.lineAt(lineNum-1).text.length)
                    )
                )
			);
			if (currentBlock.cache !== undefined) {
				currentBlock.cache.indexSymbol(document.uri.fsPath, currentBlock.symbolInformation);
				if (currentBlock.blockType === LPLBlock.Form && currentBlock.formInfo !== undefined) {
					currentBlock.formInfo.definition = currentBlock.symbolInformation;
					currentBlock.cache.actionForms.set(currentBlock.symbolInformation.name, currentBlock.formInfo);
				}
			}
			return currentBlock.symbolInformation;
        }
	}
	
	// Indexed by document uri.fsPath
	public parsedCache:Map<string, ClassCache> = new Map();
	// Indexed by class name
	private symbolCache:Map<string, ClassCache> = new Map();

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
		let symbol = this.lookupSymbol(document, position, token);
		if (symbol instanceof vscode.SymbolInformation) {
			return symbol.location;
		}
		if (symbol instanceof FieldCache || symbol instanceof RelationCache || symbol instanceof ActionCache) {
			return symbol.definition.location;
		}
		if (symbol instanceof ClassCache) {			
			return symbol.definitions.map((e) => {return e.location;});
		}
	}
	
	parseKeyField(document: vscode.TextDocument | SimpleDocument): {symbols: vscode.SymbolInformation[]; classcache: ClassCache} | undefined {
		let keyDeclaration = /^\s*(\w+)\s+is\s+a\s+KeyField\s*(\/\/[^\n]*)?$/;
		let businessClassReference = /^\s+business\s+class\s+is\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let representationPatterm = /^\s+Representation\s*(\/\/[^\n]*)?$/;
		let contextField = /^\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let comment =  /^\s*\/\/[^\n]*$/;
		let preprocessor = /^\#[^\n]*$/;
		let Context = /^\s+Context\s*(\/\/[^\n]*)?$/;
		let importCommentPattern = /\@Import\s*=\s*(\w+)\b/;
		let className: string | undefined;
		let fieldName: string | undefined;
		let fieldLocation: vscode.Location | undefined;
		let state: LPLBlock = LPLBlock.ClassRoot;
		let indentInfo: IndentInfo = new IndentInfo(0, LPLBlock.ClassRoot);
		let representation: string | undefined;
		let symbols: vscode.SymbolInformation[] = [];
		let classInfo: ClassCache | undefined;

		for(let lineNum=0; lineNum < document.lineCount; lineNum++) {
			let match: RegExpExecArray | null = null;
			let line = document.lineAt(lineNum);
            if (comment.test(line.text) || line.isEmptyOrWhitespace || preprocessor.test(line.text)) {
                continue;
			}
			if (state !== LPLBlock.ClassRoot && line.firstNonWhitespaceCharacterIndex <= indentInfo.headingIndent) {
				state = LPLBlock.ClassRoot;
			}
			if (state === LPLBlock.ClassRoot) {
				if (fieldName === undefined) {
					match = keyDeclaration.exec(line.text);
					if (match) {
						fieldName = match[1];
						fieldLocation = new vscode.Location(document.uri, new vscode.Range(lineNum, line.firstNonWhitespaceCharacterIndex, lineNum, line.firstNonWhitespaceCharacterIndex + fieldName.length));
					}
				}
				if (className === undefined && match === null) {
					match = businessClassReference.exec(line.text);
					if (match) {
						className = match[1];
						if (fieldLocation !== undefined) {
							let symbol = new vscode.SymbolInformation(className, vscode.SymbolKind.Class, "", fieldLocation);
							symbols.push(symbol);
							classInfo = new ClassCache(symbol);
						}
					}
				}
				if (match === null) {
					match = Context.exec(line.text);
					if (match) {
						state = LPLBlock.PersistentFields;
						indentInfo.headingIndent = line.firstNonWhitespaceCharacterIndex;
					}
				}
				if (match === null) {
					match = representationPatterm.exec(line.text);
					if (match) {
						state = LPLBlock.OtherSection;
					}
				}
			} else if (state === LPLBlock.PersistentFields) {
				if (indentInfo.contentIndent === undefined) {
					indentInfo.contentIndent = line.firstNonWhitespaceCharacterIndex;
				}
				if (indentInfo.contentIndent === line.firstNonWhitespaceCharacterIndex) {
					match = contextField.exec(line.text);
					if (match) {
						if (className !== undefined) {
							if (classInfo !== undefined) {
									let importComment: string | undefined;
									if (match[2]) {
										let comment = importCommentPattern.exec(match[2]);
										if (comment !== null && comment[1] ) {
											importComment = comment[1];
										}
									}
									let symbol = new vscode.SymbolInformation(match[1], vscode.SymbolKind.Field, document.uri.fsPath,
										new vscode.Location(document.uri, new vscode.Range(lineNum, line.firstNonWhitespaceCharacterIndex, lineNum, line.firstNonWhitespaceCharacterIndex + match[1].length)));
									symbols.push(symbol);
									classInfo.fields.set(match[1], new FieldCache(symbol, `Context field ${match[1]}`, importComment));
							}
						}
					}
				}
			} else if (state === LPLBlock.OtherSection) {
				state = LPLBlock.ClassRoot;
				representation = line.text;
			}
		}

		if (className && fieldName && fieldLocation) {
			if (classInfo !== undefined) {
				let symbol = new vscode.SymbolInformation(fieldName,
					vscode.SymbolKind.Key,
					document.uri.fsPath,
					fieldLocation);
				classInfo.fields.set(fieldName, new FieldCache(symbol, representation === undefined ? `Key field ${fieldName}` : representation.trimRight()));
				symbols.push(symbol);
				return {symbols: symbols, classcache: classInfo};
			}
		}
		return undefined;
	}

	public getOtherFile(document: vscode.TextDocument): vscode.Uri | undefined {
		let thisClass = this.parsedCache.get(document.fileName);
		if (thisClass !== undefined) {
			let classDefinition = this.symbolCache.get(thisClass.definitions[0].name)
			let otherFilePath : string | undefined = document.uri.fsPath.replace(/\\ui\\([^\\]+\.busclass)$/, "\\bl\\$1");
			if (otherFilePath == document.uri.fsPath)
				otherFilePath = document.uri.fsPath.replace(/\\bl\\([^\\]+\.busclass)$/, "\\ui\\$1");
			if ((otherFilePath == document.uri.fsPath) || !this.parsedCache.has(otherFilePath))
				otherFilePath = undefined;
			if (classDefinition !== undefined) {
				let busclass = /\\(ui|bl)\\[^\\.]+\.busclass$/;
				for (let def of classDefinition.definitions) {
					if (otherFilePath !== undefined) {
						if (def.location.uri.fsPath == otherFilePath)
							return def.location.uri;
					} else {
						if ((def.location.uri !== document.uri)
						&& (busclass.test(def.location.uri.fsPath))) {
							return def.location.uri;
						}
					}
				}
			}
		}
	}

	lookupSymbol(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.SymbolInformation | FieldCache | RelationCache | ActionCache | ClassCache | undefined {
		if (document.uri.fsPath.endsWith(".keyfield")) {
			let businessClassReference = /^\s+business\s+class\s+is\s+(\w+)\s*(\/\/[^\n]*)?$/;
			let match = businessClassReference.exec(document.lineAt(position.line).text);
			if (match) {
				return this.symbolCache.get(match[1]);
			}
			return;
		}

		let cache = this.cacheSymbols(document, token);
		let hasContext = false;
		if (cache === undefined) {
			return;
		}

		let wordRange = document.getWordRangeAtPosition(position);
		if (wordRange === undefined) { return; }
		let wordText = document.getText(wordRange);
		if (wordRange.start.line > 1 || wordRange.start.character > 1) {
			let predecessor = new vscode.Range(new vscode.Position(wordRange.start.line, wordRange.start.character-1), wordRange.start);
			if (document.getText(predecessor) === ".") {
				let contextRange = document.getWordRangeAtPosition(new vscode.Position(wordRange.start.line, wordRange.start.character - 2));
				let contextWord = document.getText(contextRange);
				let relationInfo = cache.relations.get(contextWord);
				if (relationInfo) {
					let maxDepth = 10;
					while (relationInfo && relationInfo.targetsRelation && --maxDepth > 0 && relationInfo.target !== undefined) {
						relationInfo = cache.relations.get(relationInfo.target);
					}
					if (relationInfo !== undefined && relationInfo.target !== undefined) {
						let otherClass = this.symbolCache.get(relationInfo.target);
						if (otherClass !== undefined) {
							cache = otherClass;
							hasContext = true;
						}
					}
				} else {
					let classContext = this.symbolCache.get(contextWord);
					if (classContext !== undefined) {
						cache = classContext;
						hasContext = true;
					}
				}
			}
		}

		let includePattern = /^\s*include\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let invokePattern = /^\s*invoke\s+(\w+)(\s+(\w+))?\s*(\/\/[^\n]*)?$/;
        let fieldPattern = /^\s+\w+(\s+is\s+((a|an|like)\s+)?((\w+)(\s+view)?|BusinessObjectReference\s+to\s+(\w+)|Iteration\s+of\s+(\w+)|snapshot\s+of\s+([\w._]+))((\s+size(\s+fixed|\s+up\s+to)?)?\s+\d+(\.\d+)?|(\s+group|\s+compute)(\s+in subject \w+)?)?)?\s*(\/\/[^\n]*)?$/;

		let match = includePattern.exec(document.lineAt(position.line).text);
		let symbol: vscode.SymbolInformation | FieldCache | RelationCache | ActionCache | ClassCache | undefined;
		if (!hasContext) {
			let found = cache.findSymbolByLine(document.uri.fsPath, position.line);
			if (found.definitionContainsLine) {
				let index = cache.index.get(document.uri.fsPath);
				if (index !== undefined) {
					symbol = index[found.indexIndex];
					if (symbol.kind === vscode.SymbolKind.Method) {
						let action = cache.actions.get(symbol.name);
						if (action !== undefined) {
							if (match !== null && match[1] === wordText) {
								symbol = action.ruleblocks.get(wordText);
								if (symbol !== undefined) {
									return symbol;
								}
							}
							symbol = action.parameters.get(wordText) || action.fields.get(wordText);
							if (symbol !== undefined) {
								return symbol;
							}
						}
					} else if (symbol.kind === vscode.SymbolKind.Interface) {
						let actionForm = cache.actionForms.get(symbol.name);
						if (actionForm !== undefined && actionForm.actionName !== undefined) {
							let action = cache.actions.get(actionForm.actionName);
							if (action !== undefined) {
								symbol = action.parameters.get(wordText) || action.fields.get(wordText);
								if (symbol !== undefined) {
									return symbol;
								}
							}
						}
					}
				}
			}
		}

		if (match !== null && match[1] === wordText) {
			symbol = cache.ruleblocks.get(wordText);
			if (symbol !== undefined) {
				return symbol;
			}
		}

		symbol = undefined;
		match = invokePattern.exec(document.lineAt(position.line).text);
		if (match !== null && match[1] === wordText) {
			if (match[3]) {
				let busclass = this.symbolCache.get(match[3]);
				if (busclass) {
					symbol = busclass.actions.get(wordText);
				}
			}
			if (symbol === undefined) {
				symbol = cache.actions.get(wordText);
			}
			if (symbol !== undefined) {
				return symbol;
			}
		}

		match = fieldPattern.exec(document.lineAt(position.line).text);
		if (match !== null && (match[5] === wordText || match[7] === wordText || match[8] === wordText || match[9] === wordText)) {
			// We matched the field *type* part of a field declaration, so don't prefer a field *name* interpretation
			symbol = this.symbolCache.get(wordText);
		}
		if (symbol === undefined) {
			symbol = cache.relations.get(wordText);
		}
		if (symbol === undefined) {
			symbol = cache.fields.get(wordText);
		}
		if (symbol === undefined && !hasContext) {
			symbol = this.symbolCache.get(wordText);
		}
		if (symbol === undefined && !hasContext) {
			symbol = cache.actions.get(wordText);
		}
		return symbol;
	}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		let symbol = this.lookupSymbol(document, position, token);
		if (symbol instanceof FieldCache || symbol instanceof RelationCache || symbol instanceof ActionCache) {
			if (symbol.hoverText !== undefined) {
				return new vscode.Hover(symbol.hoverText);
			}
		}
	}

	async generateEnabledActionReport(document: vscode.TextDocument, channel: vscode.OutputChannel) {
		let thisClass = this.parsedCache.get(document.uri.fsPath);
		if (thisClass === undefined) {
			channel.appendLine(`${document.uri.fsPath} is not cached.`);
			return;
		}

		if (thisClass.listContainers === undefined) {
			channel.appendLine(`${document.uri.fsPath} does not have any lists.`);
			return;
		}

		let restrictableOnPattern = /^\s+(\w+)(\s+is\s+(a|an)\s+((\w+\s+)?List))\s*(\/\/[^\n]*)?$/;
		//let restrictableOnPattern = /^\s+(\w+)(\s+is\s+(a|an)\s+((\w+\s+)?List|CompositeForm))\s*(\/\/[^\n]*)?$/;
		let restrictPattern = /^\s+restrict\s+action\s+(\w+)\s*(\/\/[^\n]*)?$/;
		let comment =  /^\s*\/\/[^\n]*$/;
		let preprocessor = /^\#[^\n]*$/;
		let actionIndex = new Map<string, number>();
		let listIndex = new Map<string, number>();
		let actionMatrix: string[][] = [];
		let listNames: string[] = [];
		let actions: ActionCache[] = [];
		let actionIndexNumber: number | undefined;
		let listCount = 0;
		let listInheritance = new Map<string, string[]>();
		for (let [actionName,actionCache] of thisClass.actions) {
			actionIndex.set(actionName, actions.length);
			actions.push(actionCache);
		}
		for (let listContainer of thisClass.listContainers) {
			let uiCode = await SimpleDocument.getSimpleDocument(listContainer);
			let state = LPLBlock.ClassRoot;
			let parentIndent = 0;
			for (let lineNum = 0; lineNum < uiCode.lineCount; lineNum++) {
				let line = uiCode.lineAt(lineNum);
				if (comment.test(line.text) || line.isEmptyOrWhitespace || preprocessor.test(line.text)) {
					continue;
				}
				let match: RegExpExecArray | null;
				if (state !== LPLBlock.ClassRoot && line.firstNonWhitespaceCharacterIndex <= parentIndent) {
					state = LPLBlock.ClassRoot;
					parentIndent = 0;
				}
				if (state === LPLBlock.ClassRoot) {
					match = restrictableOnPattern.exec(line.text);
					if (match) {
						state = LPLBlock.List;
						parentIndent = line.firstNonWhitespaceCharacterIndex;
						let baseListName = match[5];
						if (baseListName === undefined || baseListName === null || baseListName.length === 0) {
							baseListName = "root";
						} else {
							baseListName = baseListName.trim();
						}
						let entry = listInheritance.get(baseListName);
						if (entry === undefined) {
							entry = [match[1]];
							listInheritance.set(baseListName, entry);
						} else {
							entry.push(match[1]);
						}
						actionMatrix[listCount++] = [];
						listIndex.set(match[1], listCount-1);
						for (let index=0; index < actions.length; index++) {
							actionMatrix[listCount-1][index] = actions[index].isRestricted ? ""
								: (actions[index].validWhen !== undefined ? "V" : "X");
						}
						listNames.push(match[1]);
					}
				} else if (state === LPLBlock.List) {				
					match = restrictPattern.exec(line.text);
					if (match) {
						actionIndexNumber = actionIndex.get(match[1]);
						if (actionIndexNumber !== undefined) {
							actionMatrix[listCount-1][actionIndexNumber] = actions[actionIndexNumber].isRestricted ? "R" : "";
						} else {
							channel.appendLine(`Failed to map action name ${match[1]}`);
						}
					}
				}
			}
		}

		let base = "root";
		let derivedList = listInheritance.get(base);
		let applyInheritance = (base: string, derived: string) => {
			if (base !== "root") {
				let derivedIndex = listIndex.get(derived);
				let baseIndex = listIndex.get(base);
				if (derivedIndex !== undefined && baseIndex !== undefined) {
					for (let action = 0; action < actions.length; action++) {
						if (!actions[action].isRestricted) {
							if (actionMatrix[baseIndex][action] === "") {
								if (actionMatrix[derivedIndex][action] === "X") {
									actionMatrix[derivedIndex][action] = "";
								}
							}
						}
					}
				}
			}
			let nextLevel = listInheritance.get(derived);
			if (nextLevel !== undefined) {
				for(let next of nextLevel) {
					applyInheritance(derived, next);
				}
			}
		};
		if (derivedList !== undefined) {
			for(let derived of derivedList) {
				applyInheritance(base, derived);
			}
		}
		channel.append("ActionName,IsRestricted,ValidWhen");
		for (let listIndex = 0; listIndex < listNames.length; listIndex++) {
			channel.append(`,${listNames[listIndex]}`);
		}

		channel.appendLine("");

		for(actionIndexNumber = 0; actionIndexNumber < actions.length; actionIndexNumber++) {
			let action = actions[actionIndexNumber];
			channel.append(`${action.definition.name},${action.isRestricted?"X":""},${action.validWhen?action.validWhen:""}`);
			for(let listIndex = 0; listIndex < listNames.length; listIndex++) {
				channel.append(`,${actionMatrix[listIndex][actionIndexNumber]}`);
			}
			channel.appendLine("");
		}
	}

	checkImportClasses(channel: vscode.OutputChannel | undefined) {
		if (this.diagnostics === undefined) {
			return;
		}
		this.diagnostics.clear();
		let diagnosticMap: Map<vscode.Uri, vscode.Diagnostic[]> = new Map<vscode.Uri,vscode.Diagnostic[]>();
		for (let [className, classInfo] of this.symbolCache) {
			if (classInfo.isImportFor) {
				if (classInfo.isImportFor.target === undefined) {
					let actionInfo = classInfo.actions.get(classInfo.isImportFor.viaAction);
					if (actionInfo !== undefined) {
						let diag: vscode.Diagnostic[] | undefined = diagnosticMap.get(actionInfo.definition.location.uri);
						if (diag === undefined) {
							diag = [];
							diagnosticMap.set(actionInfo.definition.location.uri, diag);
						}
						diag.push(new vscode.Diagnostic(actionInfo.definition.location.range, "Use // @Import=<ClassName> to help the validator associate this with a target class", vscode.DiagnosticSeverity.Warning));
					}
					continue;
				}
				console.log(`Checking ${className} import fields`);
				let importToClass = this.symbolCache.get(classInfo.isImportFor.target);
				if (importToClass) {
					if (channel) {
						channel.appendLine(`${classInfo.isImportFor.target} validating against import class ${className}`);
					}
					for (let [fieldName, fieldInfo] of importToClass.fields) {
						if (fieldInfo.definition.kind !== vscode.SymbolKind.Field) {
							continue;
						}
						if (fieldInfo.importComment !== undefined) {
							fieldName = fieldInfo.importComment;
							if (fieldName === "Exclude") {
								continue;
							}
						}
						if (!classInfo.fields.has(fieldName)) {
							let diag: vscode.Diagnostic[] | undefined = diagnosticMap.get(fieldInfo.definition.location.uri);
							if (diag === undefined) {
								diag = [];
								diagnosticMap.set(fieldInfo.definition.location.uri, diag);
							}
							diag.push(new vscode.Diagnostic(fieldInfo.definition.location.range, `Field ${fieldName} is missing from Import ${className}`, vscode.DiagnosticSeverity.Warning));
						}
					}
				} else {					
					let actionInfo = classInfo.actions.get(classInfo.isImportFor.viaAction);
					if (actionInfo !== undefined) {
						let diag: vscode.Diagnostic[] | undefined = diagnosticMap.get(actionInfo.definition.location.uri);
						if (diag === undefined) {
							diag = [];
							diagnosticMap.set(actionInfo.definition.location.uri, diag);
						}
						diag.push(new vscode.Diagnostic(actionInfo.definition.location.range, `Unable to locate class ${actionInfo.importComment}`, vscode.DiagnosticSeverity.Warning));
					}
				}
			}
		}
		for (let [uri, diagnosticArray] of diagnosticMap) {
			this.diagnostics.set(uri, diagnosticArray);
		}
	}
}