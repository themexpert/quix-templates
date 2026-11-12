import { parseArgs } from 'node:util';
import { addTemplate } from '../lib/add.mjs';

const r2Base = process.env.R2_PUBLIC_BASE;
if (!r2Base) {
  console.error('R2_PUBLIC_BASE is not set (public base URL of the R2 bucket).');
  process.exit(1);
}
const { values } = parseArgs({
  options: Object.fromEntries(
    ['file', 'type', 'title', 'license', 'pack', 'category-title', 'category-alias', 'tags',
      'min-version', 'shot', 'thumb', 'slug'].map((k) => [k, { type: 'string' }]),
  ),
});
try {
  const { slug, errors } = await addTemplate(process.cwd(), values, r2Base);
  console.log(`added "${slug}"`);
  if (errors.length) {
    console.error(errors.map((e) => `- ${e}`).join('\n'));
    console.error(`\n${errors.length} problem(s) found, fix them and run npm run validate.`);
    process.exit(1);
  }
  console.log('OK');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
