import { writeIndex } from '../lib/index.mjs';

const r2Base = process.env.R2_PUBLIC_BASE;
if (!r2Base) {
  console.error('R2_PUBLIC_BASE is not set (public base URL of the R2 bucket).');
  process.exit(1);
}
try {
  const { hash } = writeIndex(process.cwd(), r2Base.replace(/\/$/, ''));
  console.log(`index.json written (sha1 ${hash})`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
