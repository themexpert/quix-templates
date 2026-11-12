import { validate } from '../lib/validate.mjs';

const r2Base = process.env.R2_PUBLIC_BASE;
if (!r2Base) {
  console.error('R2_PUBLIC_BASE is not set (public base URL of the R2 bucket).');
  process.exit(1);
}
const checkRemote = process.argv.includes('--remote');
const errors = await validate(process.cwd(), { r2Base: r2Base.replace(/\/$/, ''), checkRemote });
if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join('\n'));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('OK');
