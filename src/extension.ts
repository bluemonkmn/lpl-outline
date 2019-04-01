// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { BusinessClassDocumentSymbolProvider } from './documentSymbolProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
		console.log('LPL Outline extension is now active.');

	let symbolProvider = new BusinessClassDocumentSymbolProvider();
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'}
		],
		symbolProvider));

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'}
		]
	, symbolProvider));

	context.subscriptions.push(vscode.languages.registerHoverProvider(
		[
			{ language: 'busclass', pattern: '**/*.busclass' },
			{ language: 'busclass', scheme: 'untitled'}
		]
	, symbolProvider));
}

// this method is called when your extension is deactivated
export function deactivate() {}
