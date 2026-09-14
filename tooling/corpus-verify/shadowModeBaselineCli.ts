import * as fs from 'fs';
import {
  BASELINE_PATH,
  baselinesEqual,
  formatShadowModeBaselineDiff,
  loadShadowModeBaseline,
  runCorpusShadowModeSweep,
  writeShadowModeBaseline,
} from './shadowModeBaseline';

const write = process.argv.includes('--write');
const { baseline: live, errors } = runCorpusShadowModeSweep();
if (errors.length > 0) {
  console.error(`Shadow-mode sweep failed on ${errors.length} corpus entries:`);
  for (const error of errors.slice(0, 20)) console.error(`- ${error.file}: ${error.error}`);
  process.exitCode = 1;
} else {
  const current = fs.existsSync(BASELINE_PATH) ? loadShadowModeBaseline() : undefined;
  if (!current || !baselinesEqual(current, live)) {
    if (current) console.error(formatShadowModeBaselineDiff(current, live));
    else console.error('Shadow-mode baseline is missing. Review the generated artifact before committing it.');

    if (write) {
      writeShadowModeBaseline(live);
      console.log(`Wrote ${BASELINE_PATH}`);
    } else {
      console.error('Run `npm run corpus:shadow-baseline -- --write` only after reviewing the change.');
      process.exitCode = 1;
    }
  } else {
    console.log('Shadow-mode baseline unchanged.');
  }
}
