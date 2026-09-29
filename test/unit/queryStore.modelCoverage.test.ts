import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import ts from 'typescript';

function source(relative: string) {
  const file = resolve(__dirname, '../../src', relative);
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}
const modelSource = source('core/query/queryModel.ts');
const snapshotSource = source('webview/state/queryStore/snapshots.ts');
const model = modelSource.statements.find((node): node is ts.InterfaceDeclaration =>
  ts.isInterfaceDeclaration(node) && node.name.text === 'QueryModel');
if (!model) throw new Error('QueryModel interface not found');
const keys = model.members.map(member => member.name!.getText(modelSource)).sort();

function returnedProperties(name: string) {
  const fn = snapshotSource.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  const statement = fn?.body?.statements.find(ts.isReturnStatement);
  if (!statement?.expression || !ts.isObjectLiteralExpression(statement.expression)) {
    throw new Error(`${name}: inspect the changed mapping implementation`);
  }
  return new Map(statement.expression.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) throw new Error(`${name}: unsupported mapping property`);
    return [property.name.getText(snapshotSource), property.initializer] as const;
  }));
}
function reads(node: ts.Node, receiver: string, key: string): boolean {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === receiver && node.name.text === key) return true;
  return ts.forEachChild(node, child => reads(child, receiver, key) || undefined) === true;
}

const toFlat = returnedProperties('modelToFlat');
const fromFlat = returnedProperties('buildModelFromFlat');
const renamed: Record<string, string> = {
  tables: 'selectedTables', fields: 'selectedFields',
  // Derived from lockEnabled AND the absence of an explicit table list.
  lockForUpdateBare: 'lockEnabled',
};
const missing = keys.filter(key => {
  const flatKey = renamed[key] ?? key;
  const encode = toFlat.get(flatKey);
  const decode = fromFlat.get(key);
  return !encode || !decode || !reads(encode, 'model', key) || !reads(decode, 'flat', flatKey);
});

describe('QueryModel flat-store property coverage', () => {
  it('has no unmapped property beyond C10 (including future QueryModel additions)', () => {
    expect(missing).toEqual(['characteristics', 'trailingFields']);
  });

  // C10 OPEN: docs/development/technical-debt.md. These are known bugs, not
  // legitimate exceptions. Remove .fails and the quarantine assertion on fix.
  it.fails('C10 OPEN: every QueryModel property has mappings in both directions', () => {
    expect(missing).toEqual([]);
  });
});
