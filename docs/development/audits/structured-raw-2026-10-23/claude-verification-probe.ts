import * as fs from 'node:fs';
import { tryOpenDesignerBatch } from '@repo/src/webview/openDesignerBatch';
import { generateBatch } from '@repo/src/core/query/sdblGenerator';
import { initialState, reducer } from '@repo/src/webview/state/queryStore';
import { computeBatchTextSafe } from '@repo/src/webview/computeBatchText';
import { findStaticApplyBlocker, decideApply } from '@repo/src/webview/applyGate';
import { buildYamlResolver } from '@repo/src/core/metadata/buildYamlResolver';
import { analyze } from '@repo/src/core/query/queryAnalysisService';
const resolver=buildYamlResolver(process.argv[3]);
const w=(s:string)=>`ВЫБРАТЬ Т.Код ИЗ Справочник.Валюты КАК Т ГДЕ ${s}`;
const inner='ВЫБРАТЬ Ш.Ссылка ИЗ Справочник.Валюты КАК Ш';
const cases: [string,string][]=[];
for(const word of ['НЕ','ВЫБОР','ЕСТЬ','МЕЖДУ','КОГДА','ПОДОБНО','В','NOT']) {
  cases.push([`bare-${word}`,w(word)],[`trailing-${word}`,w(`Т.Код = 1 И ${word}`)]);
}
cases.push(
 ['having-NE','ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК К ИЗ Справочник.Валюты КАК Т ИМЕЮЩИЕ НЕ'],
 ['or-NE',w('Т.Код = 1 ИЛИ НЕ')],
 ['join-NE','ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код И НЕ'],
 ['compact-not-in',w(`Т.Ссылка НЕ В (${inner})`)],
 ['multiline-not-in',w(`Т.Ссылка НЕ В (${inner.replace(' ИЗ ','\nИЗ\n')})`)],
 ['double-not-in',w(`НЕ т.Ссылка НЕ В (${inner})`)],
 ['tuple-not-in',w('(Т.Код, Т.Наименование) НЕ В (ВЫБРАТЬ Ш.Код, Ш.Наименование ИЗ Справочник.Валюты КАК Ш)')],
 ['C46-empty-join','ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО А.Код = Б.Код И И А.Код = 1'],
 ['C46-only-join-AND','ВЫБРАТЬ А.Код ИЗ Справочник.Валюты КАК А ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Валюты КАК Б ПО И'],
 ['empty-AND',w('И')],
 ['C54-constant-list','ВЫБРАТЬ 1 КАК Результат ИЗ (ВЫБРАТЬ ЛОЖЬ КАК Флаг) КАК Т ГДЕ (НЕ Т.Флаг) В (ИСТИНА, ЛОЖЬ)'],
 ['C54-constant-subquery','ВЫБРАТЬ 1 КАК Результат ИЗ (ВЫБРАТЬ ЛОЖЬ КАК Флаг) КАК Т ГДЕ (НЕ Т.Флаг) В (ВЫБРАТЬ Ш.Флаг ИЗ (ВЫБРАТЬ ИСТИНА КАК Флаг ОБЪЕДИНИТЬ ВСЕ ВЫБРАТЬ ЛОЖЬ) КАК Ш)'],
 ['C54-negated-operand',w('(НЕ Т.ПометкаУдаления) В (&П)')],
 ['C54-negated-operand-subquery',w('(НЕ Т.ПометкаУдаления) В (ВЫБРАТЬ Ш.ПометкаУдаления ИЗ Справочник.Валюты КАК Ш)')],
);
const records:any[]=[];
for(const [id,input] of cases)for(const [mode,r] of [['none',undefined],['corpus',resolver]] as const) {
 let text=input;const passes:any[]=[];
 for(let k=0;k<3;k++) {
  const open=tryOpenDesignerBatch(text,r);
  if(!open.ok){passes.push({text,openError:open.error});break;}
  const direct=generateBatch(open.doc);
  const state=reducer(initialState(),{type:'LOAD_BATCH',doc:open.doc});
  const computed=computeBatchTextSafe(state,true);
  const blocker=findStaticApplyBlocker(state);
  const apply=decideApply(computed.text,computed.error,blocker,r,input);
  passes.push({text,model:open.doc,direct,generated:computed.text,blocker,apply,analysis:analyze(text,r).diagnostics});
  text=computed.text;
 }
 records.push({version:process.argv[2],id,mode,input,passes});
}
fs.writeFileSync(process.argv[4],JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify({version:process.argv[2],cases:cases.length,records:records.length}));
