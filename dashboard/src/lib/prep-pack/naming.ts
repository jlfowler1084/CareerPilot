// dashboard/src/lib/prep-pack/naming.ts

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\/\\\s\-]+/g, '_')   // slashes, spaces, hyphens → underscore
    .replace(/[^a-z0-9_]/g, '')     // strip everything else
    .replace(/_+/g, '_')            // collapse runs
    .replace(/^_+|_+$/g, '');       // trim
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function buildJobStem(company: string, jobTitle: string, timestamp: Date): string {
  const companySlug = slugify(company);
  const titleSlug = slugify(jobTitle);
  if (!companySlug) throw new Error('Cannot build job stem: company slugified to empty');
  if (!titleSlug) throw new Error('Cannot build job stem: jobTitle slugified to empty');

  const yyyy = timestamp.getFullYear();
  const mm = pad2(timestamp.getMonth() + 1);
  const dd = pad2(timestamp.getDate());
  const hh = pad2(timestamp.getHours());
  const mi = pad2(timestamp.getMinutes());

  return `${companySlug}_${titleSlug}_prep_${yyyy}-${mm}-${dd}-${hh}${mi}`;
}
