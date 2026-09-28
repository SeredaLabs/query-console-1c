# C4 — correlated condition fields: live query-wizard check

## Live observation

On 2026-09-28 the user opened the query wizard in the 1C web client at
`https://sldev.ukr-china.eu/SL_kza/` (configuration
`[КОПИЯ] WMS Meest China KZA / БСП 3.1.3`, English UI labels, Russian query
text), the same base as the [C3 observation](c3-hierarchy-2026-09-28.md). The
exact platform build and a metadata export were not captured, so this is a
case-specific observation, not a universal platform/version attestation.

`Справочник.Пользователи` has the attributes `Недействителен` and `Служебный`;
`Справочник.ИдентификаторыОбъектовМетаданных` has neither. Each input was typed
into the query console, the wizard was opened, and the text was read from its
**Query** editor. The wizard was closed without accepting its changes.

| # | Condition inside the subquery (input) | Wizard text of that condition |
|---|---|---|
| 1 | `Недействителен = ЛОЖЬ` | `П.Недействителен = ЛОЖЬ` |
| 2 | `НЕ Недействителен И Служебный = &Служебный` | `НЕ П.Недействителен` / `И П.Служебный = &Служебный` (two lines) |
| 3 | `П.Недействителен = ЛОЖЬ` | `П.Недействителен = ЛОЖЬ` |

Common input shape:

```sdbl
ВЫБРАТЬ П.Ссылка КАК Ссылка ИЗ Справочник.Пользователи КАК П ГДЕ П.Ссылка В (ВЫБРАТЬ Ид.Ссылка ИЗ Справочник.ИдентификаторыОбъектовМетаданных КАК Ид ГДЕ <condition>)
```

Full wizard text for case 1:

```sdbl
ВЫБРАТЬ
	П.Ссылка КАК Ссылка
ИЗ
	Справочник.Пользователи КАК П
ГДЕ
	П.Ссылка В
			(ВЫБРАТЬ
				Ид.Ссылка
			ИЗ
				Справочник.ИдентификаторыОбъектовМетаданных КАК Ид
			ГДЕ
				П.Недействителен = ЛОЖЬ)
```

Query 1 was also executed once in the console (0 rows, no error). This happened
during wizard handling and was not a planned step. It shows that the platform
accepts the bare correlated field.

## Result

The wizard qualifies a bare correlated condition field with the **enclosing**
source alias, including under `НЕ` and in a parameter comparison, and keeps an
explicit outer reference as written. With metadata, the extension's output
(`a1c69da`) is byte-identical to all three wizard texts; the texts are pinned in
`test/unit/correlatedConditions.test.ts` (both the first pass and reopening the
wizard text). Without metadata, cases 1–2 still print `Ид.<field>` — the
documented limitation.
